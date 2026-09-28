<?php
/**
 * Converts Orbit's lang/{en,bn}/*.php catalogues into one JSON file each for
 * orbit-next. Read-only: nothing in Orbit/ is written.
 */
$src = 'C:/xampp/htdocs/Orbit/lang';
$src = 'D:/xampp/htdocs/Orbit/lang';
$out = 'D:/xampp/htdocs/orbit-next/lang';

if (!is_dir($out)) {
    mkdir($out, 0777, true);
}

$report = [];
foreach (['en', 'bn'] as $lang) {
    $dict  = [];
    $files = glob("$src/$lang/*.php");
    sort($files);
    foreach ($files as $file) {
        $rows = include $file;
        if (!is_array($rows)) {
            fwrite(STDERR, "not an array: $file\n");
            continue;
        }
        foreach ($rows as $k => $v) {
            if (isset($dict[$k]) && $dict[$k] !== $v) {
                fwrite(STDERR, "duplicate key $k in " . basename($file) . "\n");
            }
            $dict[$k] = $v;
        }
    }
    ksort($dict);
    file_put_contents(
        "$out/$lang.json",
        json_encode($dict, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n"
    );
    $report[$lang] = ['files' => count($files), 'keys' => count($dict)];
}

// Which keys exist in one language but not the other.
$en = array_keys(json_decode(file_get_contents("$out/en.json"), true));
$bn = array_keys(json_decode(file_get_contents("$out/bn.json"), true));
$onlyEn = array_diff($en, $bn);
$onlyBn = array_diff($bn, $en);

echo json_encode($report, JSON_PRETTY_PRINT), "\n";
echo 'only in en: ', count($onlyEn), "\n";
echo 'only in bn: ', count($onlyBn), "\n";
foreach (array_slice(array_values($onlyEn), 0, 15) as $k) { echo "  en-only: $k\n"; }
foreach (array_slice(array_values($onlyBn), 0, 15) as $k) { echo "  bn-only: $k\n"; }
