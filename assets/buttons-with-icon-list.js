if (!customElements.get('button-list')) {
  class CollectionList extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this.selectors = {
        sliderWrapper: '.button-list__items',
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      };
      this.classes = {
        grid: 'f-flex',
        swiper: 'swiper',
        swiperWrapper: 'swiper-wrapper',
      };

      this.sectionId = this.dataset.sectionId;
      this.section = this.closest(`.section-${this.sectionId}`);
      this.sliderWrapper = this.querySelector(this.selectors.sliderWrapper);
      this.slides = this.sliderWrapper ? this.sliderWrapper.querySelectorAll('.swiper-slide') : [];

      this.enableSlider = this.dataset.enableSlider === 'true';
      this.sliderInstance = false;

      if (this.enableSlider) {
        this.init();
        document.addEventListener('matchMobile', () => this.init());
        document.addEventListener('unmatchMobile', () => this.init());
      }

      // --- AUTO SCROLL (MOBILE ONLY) ---
      if (window.matchMedia('(max-width: 767.98px)').matches) {
        const tryAutoScroll = () => {
          const activeButton =
            this.querySelector('.button-item__inner.active') ||
            this.querySelector('.button-list__item .active') ||
            this.querySelector('.button-list__items .active');

          const scrollContainer = this.querySelector('.button-list__items');
          if (!activeButton || !scrollContainer) return false;

          const makeScrollableInline = () => {
            scrollContainer.style.display = 'flex';
            scrollContainer.style.flexWrap = 'nowrap';
            scrollContainer.style.width = 'max-content';
            scrollContainer.style.overflowX = 'auto';
            scrollContainer.style.justifyContent = 'flex-start';
            scrollContainer.style.gap = getComputedStyle(scrollContainer).getPropertyValue('gap') || '0.8rem';
            const items = scrollContainer.querySelectorAll('.button-list__item');
            items.forEach((it) => {
              it.style.flex = '0 0 auto';
              it.style.maxWidth = 'none';
            });
            const parentContent = this.closest('.section__content') || this.section;
            if (parentContent) parentContent.style.overflowX = 'visible';
          };

          if (scrollContainer.scrollWidth <= scrollContainer.clientWidth) makeScrollableInline();

          const containerRect = scrollContainer.getBoundingClientRect();
          const activeRect = activeButton.getBoundingClientRect();
          const currentScroll = scrollContainer.scrollLeft;
          const targetScroll = Math.max(
            0,
            Math.round(
              currentScroll +
                (activeRect.left - containerRect.left) -
                (containerRect.width / 2 - activeRect.width / 2)
            )
          );

          if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
            try {
              scrollContainer.scrollTo({ left: targetScroll, behavior: 'smooth' });
              return true;
            } catch (err) {
              scrollContainer.scrollLeft = targetScroll;
              return true;
            }
          }

          let ancestor = this.closest('.section__content') || this.parentElement;
          while (ancestor && ancestor !== document.body) {
            if (ancestor.scrollWidth > ancestor.clientWidth) {
              const ancRect = ancestor.getBoundingClientRect();
              const targetAnc = Math.max(
                0,
                Math.round(
                  ancestor.scrollLeft +
                    (activeRect.left - ancRect.left) -
                    (ancRect.width / 2 - activeRect.width / 2)
                )
              );
              try {
                ancestor.scrollTo({ left: targetAnc, behavior: 'smooth' });
              } catch {
                ancestor.scrollLeft = targetAnc;
              }
              return true;
            }
            ancestor = ancestor.parentElement;
          }
          return false;
        };

        setTimeout(tryAutoScroll, 450);
        let attempts = 0;
        const retryInterval = setInterval(() => {
          attempts++;
          if (tryAutoScroll() || attempts > 10) clearInterval(retryInterval);
        }, 300);

        const mo = new MutationObserver((mutations) => {
          const found = mutations.some(
            (m) =>
              (m.type === 'attributes' && m.attributeName === 'class') ||
              (m.addedNodes && m.addedNodes.length)
          );
          if (found) tryAutoScroll();
        });
        mo.observe(this, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });

        window.addEventListener('load', () => setTimeout(tryAutoScroll, 200), { once: true });
      }
    }

    init() {
      if (FoxTheme.config.mqlMobile) {
        this.destroySlider();
      } else {
        this.initSlider();
      }
    }

    initSlider() {
      const columnGap = window.getComputedStyle(this.sliderWrapper).getPropertyValue('--column-gap');
      const spaceBetween = parseFloat(columnGap.replace('rem', '')) * 10 || 12;
      const sliderOptions = {
        slidesPerView: 'auto',
        centeredSlides: false,
        spaceBetween,
        navigation: {
          nextEl: this.section.querySelector(this.selectors.nextEl),
          prevEl: this.section.querySelector(this.selectors.prevEl),
        },
        pagination: false,
        threshold: 2,
      };

      if (typeof this.sliderInstance !== 'object') {
        this.classList.add(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.grid);
        this.sliderWrapper.classList.add(this.classes.swiperWrapper);
        this.sliderInstance = new window.FoxTheme.Carousel(this, sliderOptions);
        this.sliderInstance.init();

        const focusableElements = FoxTheme.a11y.getFocusableElements(this);
        focusableElements.forEach((element) => {
          element.addEventListener('focusin', () => {
            const slide = element.closest('.swiper-slide');
            this.sliderInstance.slider.slideTo(this.sliderInstance.slider.slides.indexOf(slide));
          });
        });

        this.sliderInstance.slider.on('progress', ({ progress }) => {
          this.updateSliderReach(progress === 0 ? 'begin' : progress === 1 ? 'end' : 'progress');
        });
      }

      if (Shopify.designMode && typeof this.sliderInstance === 'object') {
        document.addEventListener('shopify:block:select', (e) => {
          if (e.detail.sectionId != this.sectionId) return;
          const { target } = e;
          const index = Number(target.dataset.index);
          this.sliderInstance.slider.slideTo(index);
        });
      }
    }

    destroySlider() {
      this.classList.remove(this.classes.swiper);
      this.sliderWrapper.classList.remove(this.classes.swiperWrapper);
      this.sliderWrapper.classList.add(this.classes.grid);
      if (typeof this.sliderInstance === 'object') {
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;
      }
    }

    updateSliderReach = (position) => {
      this.dataset.sliderReach = position;
    };
  }

  customElements.define('button-list', CollectionList);
}
