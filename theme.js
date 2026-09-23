// Тема ставится до отрисовки, иначе при загрузке мигает светлый экран.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('adervis.theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
