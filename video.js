(() => {
  document.querySelectorAll('video[id]').forEach(player => {
  const section = player.closest('[data-video-section]') || player.closest('section');
  const status = section.querySelector('.video-status');
  let pendingTime = null;
  let hoverPreview = false;
  let mutedBeforePreview = false;
  let previewAttempt = 0;

  const stopPreview = () => {
    if (!hoverPreview) return;
    hoverPreview = false;
    previewAttempt++;
    player.pause();
    player.muted = mutedBeforePreview;
  };
  const takePlaybackControl = () => {
    if (!hoverPreview) return;
    hoverPreview = false;
    previewAttempt++;
    player.muted = mutedBeforePreview;
  };

  player.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches ||
        matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !player.paused || pendingTime !== null) return;
    mutedBeforePreview = player.muted;
    hoverPreview = true;
    player.muted = true;
    const attempt = ++previewAttempt;
    player.play().catch(() => {
      if (attempt === previewAttempt) stopPreview();
    });
  });
  player.addEventListener('pointerleave', stopPreview);
  player.addEventListener('pointerdown', takePlaybackControl);
  player.addEventListener('keydown', takePlaybackControl);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPreview();
  });

  const playChapter = () => {
    if (pendingTime === null || player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    // Metadata can arrive before the media has a usable seek range, especially
    // on static servers without byte-range support. Keep the requested chapter
    // until it is actually seekable rather than silently starting at zero.
    const seekable = Array.from({ length: player.seekable.length }, (_, i) =>
      pendingTime >= player.seekable.start(i) && pendingTime <= player.seekable.end(i));
    if (!seekable.some(Boolean)) {
      if (player.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && player.networkState === HTMLMediaElement.NETWORK_IDLE) {
        pendingTime = null;
        status.textContent = '이 서버에서는 구간 이동을 지원하지 않습니다. 재생 버튼으로 처음부터 볼 수 있습니다.';
      }
      return;
    }
    player.currentTime = pendingTime;
    pendingTime = null;
    player.play().catch(error => {
      if (error.name !== 'AbortError' && player.paused) {
        status.textContent = '재생 버튼을 누르면 선택한 구간부터 볼 수 있습니다.';
      }
    });
  };

  player.addEventListener('loadedmetadata', playChapter);
  player.addEventListener('loadeddata', playChapter);
  player.addEventListener('canplay', playChapter);
  player.addEventListener('progress', playChapter);
  player.addEventListener('playing', () => { status.textContent = ''; });
  player.addEventListener('error', () => {
    status.textContent = '영상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  });

  document.querySelectorAll('[data-video-time]').forEach(link => {
    if ((link.dataset.videoFor || 'career-player') !== player.id) return;
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      takePlaybackControl();
      pendingTime = Number(link.dataset.videoTime);
      if (player.readyState >= 1) playChapter();
      else {
        player.preload = 'auto';
        player.load();
      }
      section.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'center'
      });
      player.focus({ preventScroll: true });
    });
  });
  });
})();
