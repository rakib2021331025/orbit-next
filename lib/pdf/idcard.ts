import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { translate, type Lang } from '@/lib/i18n';
import { formatDate, pickLocalized } from '@/lib/i18n/format';
import { setting, settingLocalized, settingNumber } from '@/lib/settings';
import { getFile } from '@/lib/storage/store';
import { ensureStudentId } from '@/lib/students/id';
import { FONT_BOLD, FONT_REGULAR, newPdf, pdfBytes } from './doc';

/**
 * Student ID cards, from includes/idcard_lib.php.
 *
 * CR80: **85.6 × 54 mm**, one card side per page, so the file can go straight to
 * a card printer. In points that is 242.65 × 153.07.
 *
 * Issuing happens here, as it does in the original: opening the card assigns a
 * Student ID if the student has none and records the issue and validity dates.
 * Everything else is read live, so a reprint after an edit shows current data.
 */

/** CR80 in PDF points. */
const CARD: [number, number] = [242.65, 153.07];

const BRAND_DEEP = '#062c19';
const BRAND_MID = '#0f5132';
const ACCENT = '#fedc02';

export interface CardStudent {
  id: number;
  name: string;
  name_bn: string | null;
  student_id_no: string | null;
  roll_number: string | null;
  phone: string;
  guardian_phone: string | null;
  blood_group: string | null;
  image: string;
  course: string;
  batch: string | null;
  batch_id: number | null;
}

export interface Card {
  student: CardStudent;
  course: string;
  batch: string;
  issued: string;
  valid: string;
  expired: boolean;
  photo: Buffer | null;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Student ID to print, or the STU-00001 fallback. */
export function displayId(student: { id: number; student_id_no: string | null }): string {
  const value = (student.student_id_no ?? '').trim();
  return value !== '' ? value : `STU-${String(student.id).padStart(5, '0')}`;
}

/**
 * The cards for a set of students.
 *
 * With `issue` the dates are written and a missing Student ID is assigned —
 * which is why this is the write side and the page calling it must be an admin
 * page.
 */
export async function buildCards(ids: number[], issue: boolean, lang: Lang): Promise<Card[]> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 300);
  if (unique.length === 0) return [];

  const students = await prisma.student
    .findMany({
      where: { id: { in: unique } },
      orderBy: { name: 'asc' },
      include: {
        enrollment_student: {
          where: { status: 'active' },
          orderBy: [{ enrolled_at: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            course_name: true,
            batch_name: true,
            course: { select: { name: true, name_bn: true } },
            batch: { select: { name: true, name_bn: true } },
          },
        },
      },
    })
    .catch(() => []);

  const months = Math.max(1, await settingNumber('id_card_validity_months', 12));
  const today = iso(new Date());
  const cards: Card[] = [];

  for (const student of students) {
    let idNo = (student.student_id_no ?? '').trim();
    if (issue && idNo === '') {
      try {
        idNo = await ensureStudentId(student.id);
      } catch {
        // A card without an ID is still better than no card.
      }
    }

    const enrolment = student.enrollment_student[0];
    const course =
      enrolment?.course?.name !== undefined
        ? pickLocalized(enrolment.course, 'name', lang)
        : (enrolment?.course_name ?? student.course ?? '');
    const batch =
      enrolment?.batch?.name !== undefined
        ? pickLocalized(enrolment.batch, 'name', lang)
        : (enrolment?.batch_name ?? student.batch ?? '');

    let issued = student.id_card_issued_at ? iso(student.id_card_issued_at) : today;
    let valid = student.id_card_valid_until ? iso(student.id_card_valid_until) : '';

    if (issue) {
      issued = today;
      // An expired or missing validity is extended; a valid one is left alone.
      if (valid === '' || valid < today) {
        const until = new Date(`${today}T00:00:00.000Z`);
        until.setUTCMonth(until.getUTCMonth() + months);
        valid = iso(until);
      }
      try {
        await prisma.student.update({
          where: { id: student.id },
          data: { id_card_issued_at: new Date(), id_card_valid_until: new Date(`${valid}T00:00:00.000Z`) },
        });
      } catch {
        // Printing must not fail because the dates could not be recorded.
      }
    } else if (valid === '') {
      const until = new Date(`${issued}T00:00:00.000Z`);
      until.setUTCMonth(until.getUTCMonth() + months);
      valid = iso(until);
    }

    const photo = student.image.trim() !== '' ? await getFile(student.image) : null;

    cards.push({
      student: {
        id: student.id,
        name: student.name,
        name_bn: student.name_bn,
        student_id_no: idNo !== '' ? idNo : student.student_id_no,
        roll_number: student.roll_number,
        phone: student.phone,
        guardian_phone: student.guardian_phone,
        blood_group: student.blood_group,
        image: student.image,
        course: student.course,
        batch: student.batch,
        batch_id: student.batch_id,
      },
      course,
      batch,
      issued,
      valid,
      expired: valid < today,
      photo,
    });
  }

  return cards;
}

export interface CardInstitute {
  name: string;
  address: string;
  phone: string;
  email: string;
  director: string;
  note: string;
  logo: Buffer | null;
}

/** The institute details printed on every card. */
export async function cardInstitute(lang: Lang): Promise<CardInstitute> {
  const [name, address, helpline, contact, email, director, note, logoPath] = await Promise.all([
    settingLocalized('institute_name', 'Orbit Private Care', lang),
    settingLocalized('institute_address', '', lang),
    setting('helpline_number', ''),
    setting('contact_phone', ''),
    setting('institute_email', ''),
    setting('director_name', ''),
    settingLocalized('id_card_note', '', lang),
    setting('logo_path', ''),
  ]);

  let logo: Buffer | null = null;
  if (logoPath !== '') logo = await getFile(logoPath);

  return {
    name,
    address,
    // The helpline is what a found card should be rung on; the office number is
    // the fallback.
    phone: helpline !== '' ? helpline : contact,
    email,
    director,
    note,
    logo,
  };
}

/** Both sides of every card, one side per page. */
export async function idCardPdf(
  cards: Card[],
  institute: CardInstitute,
  lang: Lang
): Promise<Buffer> {
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars);

  // No automatic first page: every page here is a card, at the card's own size.
  const doc = await newPdf({
    title: t('idc.title'),
    author: institute.name,
    margin: 0,
    firstPage: false,
  });

  const page = () => doc.addPage({ size: CARD, margin: 0 });

  for (const card of cards) {
    const student = card.student;

    /* ------------------------------------------------------------ front */
    page();
    const width = CARD[0];
    const height = CARD[1];

    doc.rect(0, 0, width, 34).fill(BRAND_DEEP);
    if (institute.logo !== null) {
      try {
        doc.image(institute.logo, 6, 5, { fit: [24, 24] });
      } catch {
        // A logo that will not decode is skipped.
      }
    }
    doc
      .font(FONT_BOLD)
      .fontSize(9)
      .fillColor('#ffffff')
      .text(institute.name, institute.logo !== null ? 34 : 8, 8, { width: width - 42 });
    doc
      .font(FONT_REGULAR)
      .fontSize(5.5)
      .fillColor(ACCENT)
      .text(t('idc.card_label'), institute.logo !== null ? 34 : 8, 22, { width: width - 42 });

    // The photo box.
    const photoX = 10;
    const photoY = 44;
    const photoWidth = 52;
    const photoHeight = 62;
    doc.rect(photoX, photoY, photoWidth, photoHeight).fillAndStroke('#f1f6f2', '#d5e0d8');
    if (card.photo !== null) {
      try {
        doc.image(card.photo, photoX + 1, photoY + 1, {
          fit: [photoWidth - 2, photoHeight - 2],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // No photo on file, or one that will not decode.
      }
    }

    const textX = photoX + photoWidth + 8;
    const textWidth = width - textX - 10;

    doc
      .font(FONT_BOLD)
      .fontSize(9.5)
      .fillColor(BRAND_DEEP)
      .text(pickLocalized(student, 'name', lang), textX, photoY, { width: textWidth });

    const rows: [string, string][] = [
      [t('ms.student_id'), displayId(student)],
      [t('idc.course'), card.course],
      [t('idc.batch'), card.batch],
      [t('ms.roll'), (student.roll_number ?? '').trim()],
      [t('idc.blood'), (student.blood_group ?? '').trim()],
      [t('idc.mobile'), student.phone],
    ];

    let y = doc.y + 2;
    for (const [label, value] of rows) {
      if (value.trim() === '') continue;
      doc.font(FONT_REGULAR).fontSize(5.6).fillColor('#5b6961').text(`${label}: `, textX, y, {
        width: textWidth,
        continued: true,
      });
      doc.font(FONT_BOLD).fontSize(6.4).fillColor('#1d2a22').text(value, { width: textWidth });
      y = doc.y + 0.5;
    }

    doc.rect(0, height - 14, width, 14).fill(BRAND_MID);
    doc
      .font(FONT_REGULAR)
      .fontSize(5.4)
      .fillColor('#d9e8de')
      .text(
        `${t('idc.valid', { date: formatDate(card.valid, 'd M Y', lang) })}${
          card.expired ? ` · ${t('idc.expired')}` : ''
        }`,
        8,
        height - 10,
        { width: width - 16 }
      );

    /* ------------------------------------------------------------- back */
    page();

    doc.rect(0, 0, width, 20).fill(BRAND_DEEP);
    doc
      .font(FONT_BOLD)
      .fontSize(7.5)
      .fillColor('#ffffff')
      .text(t('idc.back_title'), 8, 6, { width: width - 16 });

    const terms =
      institute.note.trim() !== ''
        ? institute.note
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .slice(0, 4)
        : [
            t('idc.term1', { institute: institute.name }),
            t('idc.term2'),
            t('idc.term3'),
          ];

    let backY = 26;
    doc.font(FONT_REGULAR).fontSize(5.6).fillColor('#1d2a22');
    for (const term of terms) {
      doc.text(`• ${term}`, 8, backY, { width: width - 16 });
      backY = doc.y + 1;
    }

    backY += 2;
    const emergency = (student.guardian_phone ?? '').trim();
    const details: [string, string][] = [
      [t('idc.emergency'), emergency],
      [t('idc.helpline'), institute.phone],
      [t('idc.issued', { date: formatDate(card.issued, 'd M Y', lang) }), ''],
    ];

    for (const [label, value] of details) {
      if (value === '') {
        doc.font(FONT_REGULAR).fontSize(5.4).fillColor('#5b6961').text(label, 8, backY, {
          width: width - 16,
        });
      } else {
        doc.font(FONT_REGULAR).fontSize(5.4).fillColor('#5b6961').text(`${label}: `, 8, backY, {
          width: width - 16,
          continued: true,
        });
        doc.font(FONT_BOLD).fontSize(6).fillColor('#1d2a22').text(value, { width: width - 16 });
      }
      backY = doc.y + 0.5;
    }

    // The signature line, and who signs it.
    doc
      .moveTo(width - 90, height - 26)
      .lineTo(width - 12, height - 26)
      .lineWidth(0.5)
      .strokeColor('#8a978f')
      .stroke();
    doc
      .font(FONT_REGULAR)
      .fontSize(5)
      .fillColor('#5b6961')
      .text(institute.director !== '' ? institute.director : t('idc.authorised'), width - 90, height - 24, {
        width: 78,
        align: 'center',
      });

    doc
      .font(FONT_REGULAR)
      .fontSize(4.8)
      .fillColor('#8a978f')
      .text(t('idc.if_found', { institute: institute.name }), 8, height - 12, {
        width: width - 100,
      });
  }

  return pdfBytes(doc);
}
