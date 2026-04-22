<?php
/**
 * Подгрузка новостей для страницы news.php (UTF-8).
 * Нужен PHP с allow_url_fopen=1 или включённым openssl для HTTPS.
 */

function news_http_get(string $url): string
{
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 18,
            'header' =>
                "User-Agent: Mozilla/5.0 (Windows NT 10.0; compatible; ChurchSite/1.0)\r\n" .
                "Accept: text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $data = @file_get_contents($url, false, $ctx);
    return $data === false ? '' : $data;
}

/** @return list<array{title:string,link:string,excerpt:string,date:string,source:string}> */
function news_fetch_vob(int $limit): array
{
    $html = news_http_get('https://www.vob-eparhia.ru/m/set.php?gr=20020');
    if ($html === '') {
        return [];
    }
    $out = [];
    $seen = [];
    if (preg_match_all(
        '/href="doc\.php\?d=(\d+)"[^>]*>\s*<strong>([^<]+)<\/strong><\/a><br\s*\/?>\s*([^<]+)/iu',
        $html,
        $m,
        PREG_SET_ORDER
    )) {
        foreach ($m as $row) {
            $id = $row[1];
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $out[] = [
                'title' => html_entity_decode(trim($row[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'link' => 'https://www.vob-eparhia.ru/m/doc.php?d=' . $id,
                'excerpt' => html_entity_decode(trim($row[3]), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'date' => '',
                'source' => 'Воронежская епархия (vob-eparhia.ru)',
            ];
            if (count($out) >= $limit) {
                break;
            }
        }
    }
    return $out;
}

/** @return list<array{title:string,link:string,excerpt:string,date:string,source:string}> */
function news_fetch_patriarchia_rss(int $limit): array
{
    $xml = news_http_get('https://api.patriarchia.ru/v1/rss/news');
    if ($xml === '' || stripos($xml, '<rss') === false) {
        return [];
    }
    libxml_use_internal_errors(true);
    $sx = simplexml_load_string($xml);
    if (!$sx || !isset($sx->channel->item)) {
        return [];
    }
    $out = [];
    foreach ($sx->channel->item as $it) {
        $desc = isset($it->description) ? strip_tags((string) $it->description) : '';
        $out[] = [
            'title' => trim((string) $it->title),
            'link' => trim((string) $it->link),
            'excerpt' => mb_substr($desc, 0, 320, 'UTF-8'),
            'date' => trim((string) $it->pubDate),
            'source' => 'Патриархия.ru',
        ];
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * Если RSS пустой — вытаскиваем хотя бы ссылки на материалы с HTML-страницы (как в вашем примере со strpos).
 */
/** @return list<array{title:string,link:string,excerpt:string,date:string,source:string}> */
function news_fetch_patriarchia_html_fallback(int $limit): array
{
    $html = news_http_get('https://www.patriarchia.ru/news/latest');
    if ($html === '') {
        return [];
    }
    $out = [];
    $seen = [];
    if (preg_match_all('/href="(\/article\/\d+)"[^>]*>([^<]+)<\/a>/u', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $row) {
            $path = $row[1];
            if (isset($seen[$path])) {
                continue;
            }
            $seen[$path] = true;
            $out[] = [
                'title' => html_entity_decode(trim($row[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'link' => 'https://www.patriarchia.ru' . $path,
                'excerpt' => '',
                'date' => '',
                'source' => 'Патриархия.ru',
            ];
            if (count($out) >= $limit) {
                break;
            }
        }
    }
    return $out;
}

/** @return list<array{title:string,link:string,excerpt:string,date:string,source:string}> */
function news_fetch_patriarchia(int $limit): array
{
    $rss = news_fetch_patriarchia_rss($limit);
    if (count($rss) > 0) {
        return $rss;
    }
    return news_fetch_patriarchia_html_fallback($limit);
}
