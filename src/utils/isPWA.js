const isPWA =
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches

export default isPWA
