(() => {
  function reveal(hash) {
    let target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    if (!target) return;
    const project = target.closest('.project');
    if (project) { const details = project.querySelector('.project-details'); if (details) details.open = true; }
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    return target;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) reveal(link.hash);
  });
  window.addEventListener('hashchange', () => {
    const target = reveal(location.hash);
    if (target) target.scrollIntoView();
  });
  const target = reveal(location.hash);
  if (target) requestAnimationFrame(() => target.scrollIntoView());
})();
