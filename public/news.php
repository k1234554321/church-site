<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/includes/news_helpers.php';

$source = isset($_GET['source']) ? (string) $_GET['source'] : 'all';
if (!in_array($source, ['all', 'patriarchia', 'vob_eparhia', 'voronezh'], true)) {
    $source = 'all';
}
// совместимость со старым именем
if ($source === 'voronezh') {
    $source = 'vob_eparhia';
}

$limit = 15;
$items = [];

if ($source === 'all') {
    $items = array_merge(news_fetch_patriarchia($limit), news_fetch_vob($limit));
    usort($items, static function (array $a, array $b): int {
        $ta = strtotime($a['date']) ?: 0;
        $tb = strtotime($b['date']) ?: 0;
        return $tb <=> $ta;
    });
    $items = array_slice($items, 0, $limit);
} elseif ($source === 'patriarchia') {
    $items = news_fetch_patriarchia($limit);
} else {
    $items = news_fetch_vob($limit);
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$headerHtml = file_get_contents(__DIR__ . '/partials/header.html');
if ($headerHtml !== false) {
    $headerHtml = str_replace('href="/news.html"', 'href="/news.php"', $headerHtml);
} else {
    $headerHtml = '';
}

$footerHtml = file_get_contents(__DIR__ . '/partials/footer.html');
if ($footerHtml === false) {
    $footerHtml = '';
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Новости — приход Борисоглебск</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body data-nav="news">
  <div id="header-root"><?php echo $headerHtml; ?></div>

  <main class="page-main">
    <div class="container">
      <div class="page-head">
        <h1>Новости</h1>
        <p class="lead">Материалы подгружаются с сайтов <a href="https://www.patriarchia.ru/" target="_blank" rel="noopener noreferrer">Патриархия.ru</a> и <a href="https://www.vob-eparhia.ru/" target="_blank" rel="noopener noreferrer">Воронежской епархии</a> (PHP на сервере).</p>
      </div>

      <div class="news-toolbar">
        <form method="get" action="/news.php" class="field-inline" style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
          <label>
            <span class="visually-hidden">Источник</span>
            <select name="source" class="input" onchange="this.form.submit()">
              <option value="all"<?php echo $source === 'all' ? ' selected' : ''; ?>>Все источники</option>
              <option value="patriarchia"<?php echo $source === 'patriarchia' ? ' selected' : ''; ?>>Патриархия.ru</option>
              <option value="vob_eparhia"<?php echo $source === 'vob_eparhia' ? ' selected' : ''; ?>>Воронежская епархия</option>
            </select>
          </label>
          <button type="submit" class="btn btn--small">Обновить</button>
        </form>
      </div>

      <div class="news-feed" aria-live="polite">
        <?php if (count($items) === 0) : ?>
          <p class="muted">Новостей пока нет или внешний сайт временно не ответил. Попробуйте позже или откройте источники по ссылкам выше.</p>
        <?php else : ?>
          <?php foreach ($items as $it) : ?>
            <article class="news-item">
              <h2 class="news-item__title">
                <a href="<?php echo h($it['link']); ?>" target="_blank" rel="noopener noreferrer"><?php echo h($it['title'] ?: 'Без заголовка'); ?></a>
              </h2>
              <p class="news-meta"><?php echo h($it['source']); ?><?php echo $it['date'] !== '' ? ' · ' . h($it['date']) : ''; ?></p>
              <?php if ($it['excerpt'] !== '') : ?>
                <p class="muted"><?php echo h($it['excerpt']); ?></p>
              <?php endif; ?>
            </article>
          <?php endforeach; ?>
        <?php endif; ?>
      </div>

      <p style="margin-top:2rem;"><a href="/">← На главную</a> · <a href="/news.html">Версия через Node (npm)</a></p>
    </div>
  </main>

  <div id="footer-root"><?php echo $footerHtml; ?></div>
  <script src="/js/layout.js"></script>
</body>
</html>
