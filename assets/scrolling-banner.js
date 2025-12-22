if ( !customElements.get('scrolling-banner') ) {
  customElements.define('scrolling-banner', class ScrollingBanner extends HTMLElement {
    constructor() {
      super();

      const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
      mql.onchange = this.init.bind(this);
      this.init();
    }

    get items() {
      return this.querySelectorAll('.slide');
    }

    init() {
      this.zoom = this.dataset.zoom === 'true';
      this.parallax = this.dataset.parallax === 'true';
      this.header = document.querySelector('header');
      this.borderRadius = this.dataset.borderRadius;

      this.slideRequestAnimationFrame = true;

      // Debounce resize events to avoid excessive recalculations
      let resizeTimeout;
      this.onScrollHandler = (() => {
        if (this.slideRequestAnimationFrame) {
          this.slideRequestAnimationFrame = false;
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            requestAnimationFrame(this.handleSlideAnimation.bind(this));
          }, 100);
        }
      }).bind(this);

      window.addEventListener("resize", this.onScrollHandler, { passive: true });

      // Defer initial calculation to avoid blocking initial render
      requestIdleCallback ? requestIdleCallback(() => this.onScrollHandler()) : setTimeout(() => this.onScrollHandler(), 100);
    }
    handleSlideAnimation() {
      // BATCH ALL DOM READS FIRST to prevent forced reflow
      const headerHeight = this.header ? Math.round(this.header.offsetHeight) : 0;
      const isHeaderSticky = this.header?.isAlwaysSticky || false;
      const windowHeight = isHeaderSticky ? window.innerHeight - headerHeight : window.innerHeight;

      const itemsArray = [...this.items];
      const segmentLength = 1 / itemsArray.length;
      const itemHeight = itemsArray[0]?.offsetHeight || 0;
      const translateY = Math.min(250, (itemHeight * 0.3));
      const endpoint = Math.min((itemHeight / windowHeight), 1);
      const cardZoom = 4;

      // Pre-calculate all values before DOM writes
      const headerRatio = isHeaderSticky ? headerHeight/window.innerHeight : 0;

      itemsArray.forEach((item, i) => {
        const index = i + 1;
        const content = item.querySelector('.slide__content');
        const product = item.querySelector('.slide__product');
        const card = item.querySelector('.slide__card');
        const cardMedia = card.querySelector('.media');
        const cardMediaChild = cardMedia.children[0];

        // Zoom
        if (this.zoom) {
          FoxTheme.Motion.scroll(
            FoxTheme.Motion.animate(
              card,
              {
                clipPath: [`inset(0 round ${this.borderRadius}px)`, `inset(0 ${cardZoom}% round ${this.borderRadius}px)`],
              }
            ),
            { 
              target: this, 
              offset: [
                [(index * segmentLength) + 0.012, endpoint],
                [(index + 1) * segmentLength, endpoint]
              ] 
            }
          );

          FoxTheme.Motion.scroll(
            FoxTheme.Motion.animate(
              content,
              {
                transform: [`scale(1)`, `scale(${100 - cardZoom * 2 }%)`],
              }
            ),
            { 
              target: this, 
              offset: [
                [(index * segmentLength) + 0.012, endpoint],
                [(index + 1) * segmentLength, endpoint]
              ] 
            }
          );

          if (product) {
            FoxTheme.Motion.scroll(
              FoxTheme.Motion.animate(
                product,
                {
                  transform: [`translateY(0)`, `translateY(${itemHeight / 100 * 4}px)`],
                }
              ),
              { 
                target: this, 
                offset: [
                  [(index * segmentLength) + 0.012, endpoint],
                  [(index + 1) * segmentLength, endpoint]
                ] 
              }
            );
          }
        }

        // Parallax
        if (this.parallax) {
          if ( i == 0 ) {
            FoxTheme.Motion.scroll(
              FoxTheme.Motion.animate(
                cardMedia,
                { transform: [`translateY(0)`, `translateY(${-translateY}px)`], transformOrigin: ['top', 'top'] },
                { easing: "ease-out" }
              ),
              { 
                target: this, 
                offset: [
                  [(index * segmentLength), endpoint],
                  [(index + 1) * segmentLength, endpoint]
                ] 
              }
            );
          } else {
            FoxTheme.Motion.scroll(
              FoxTheme.Motion.animate(
                cardMedia,
                { transform: [`translateY(${-translateY}px)`, `translateY(0)`], transformOrigin: ['bottom', 'bottom'] },
                { easing: "ease-out" }
              ),
              { 
                target: this, 
                offset: [
                  [i * segmentLength, 1],
                  [index * segmentLength, 1]
                ] 
              }
            );

            if (i < itemsArray.length - 1 ) {
              FoxTheme.Motion.scroll(
                FoxTheme.Motion.animate(
                  cardMediaChild,
                  { transform: [`translateY(0)`, `translateY(${-translateY}px)`], transformOrigin: ['top', 'top'] },
                  { easing: "ease-out" }
                ),
                {
                  target: this,
                  offset: [
                    [i * segmentLength, headerRatio],
                    [index * segmentLength, headerRatio]
                  ]
                }
              );
            }
          }
        }
      });

      this.slideRequestAnimationFrame = true;
    }
  });
}