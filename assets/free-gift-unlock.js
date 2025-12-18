if (!customElements.get('free-gift-unlock')) {
  class FreeGiftUnlock extends HTMLElement {
    constructor() {
      super();
      this.cartUpdatedHandler = (event) => this.handleCartUpdate(event?.detail);
      this.isRefreshing = false;
      this.initialized = false;
    }

    connectedCallback() {
      if (this.initialized) return;

      this.tiers = this.parseTiers();
      this.currentTier = parseInt(this.dataset.currentTier, 10) || 0;
      this.cartTotal = parseInt(this.dataset.cartTotal, 10) || 0;
      this.giftItems = this.parseGiftItems();

      this.selectedVariantId = null;
      this.sectionId = this.dataset.sectionId;
      this.moneyFormat = this.dataset.moneyFormat;

      if (!this.sectionId) {
        const sectionEl = this.closest('.shopify-section');
        if (sectionEl) {
          this.sectionId =
            sectionEl.dataset.section ||
            sectionEl.dataset.sectionId ||
            sectionEl.id?.replace('shopify-section-', '');
        }
      }

      this.init();
      this.initialized = true;

      this.autoRemoveLowerTierGifts();

    }

    disconnectedCallback() {
      document.removeEventListener('cart:updated', this.cartUpdatedHandler);
    }

    parseTiers() {
      const tiersData = this.dataset.tiers;
      if (!tiersData) return [];

      return tiersData.split('|').map((tier, index) => {
        const [threshold, collection] = tier.split(',');
        return {
          level: index + 1,
          threshold: parseInt(threshold),
          collection: collection ? collection.trim() : ''
        };
      }).filter(tier => tier.threshold);
    }

    parseGiftItems() {
      const items = this.dataset.giftItems;
      if (!items) return {};

      const result = {};
      items.split(',').forEach(item => {
        const [tier, key] = item.split(':');
        if (tier && key) {
          result[tier] = key.trim();
        }
      });
      return result;
    }

    async autoRemoveLowerTierGifts() {
      const hasLowerTierGifts = this.dataset.hasLowerTierGifts === 'true';
      const lowerTierGiftKeys = this.dataset.lowerTierGifts;

      if (hasLowerTierGifts && lowerTierGiftKeys) {
        const keys = lowerTierGiftKeys.split(',');

        for (const key of keys) {
          await this.removeGiftFromCart(key.trim());
        }

        await this.refreshCart();
      }
    }

    init() {
      this.bindEvents();

      const preselected = this.querySelector('.gift-card.gift-card--selected');
      if (preselected) {
        this.selectedVariantId = preselected.dataset.giftVariant;
        return;
      }

      const firstItem = this.querySelector('.gift-card');
      if (firstItem) {
        this.selectGiftItem(firstItem);
      }
    }
    async removeGiftAndReload(tier) {
      const giftKey = this.giftItems[String(tier)];
      if (!giftKey) {
        console.warn('No gift found for tier: ' + tier);
        return;
      }

      await this.removeGiftFromCart(giftKey);
      await this.refreshCart();
    }

    bindEvents() {
      this.querySelectorAll('.gift-card').forEach((item) => {
        item.addEventListener('click', () => this.selectGiftItem(item));
      });

      const addBtn = this.querySelector('[data-add-gift-btn]');
      if (addBtn) {
        addBtn.addEventListener('click', () => this.addGiftToCart());
      }

      this.querySelectorAll('[data-change-gift]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tier = btn.dataset.changeGift;
          await this.removeGiftAndReload(tier);
        });
      });

      document.addEventListener('cart:updated', this.cartUpdatedHandler);
    }

    selectGiftItem(item) {
      if (!item) return;

      this.querySelectorAll('.gift-card').forEach((el) => {
        el.classList.remove('gift-card--selected');
      });
      item.classList.add('gift-card--selected');
      this.selectedVariantId = item.dataset.giftVariant;
    }

    handleCartUpdate(cartPayload) {
      if (!this.isConnected) return;

      const cart = cartPayload?.cart || cartPayload;
      if (cart && Array.isArray(cart.items)) {
        this.evaluateUnlockState(cart);
        return;
      }

      this.fetchCartSnapshot();
    }

    async evaluateUnlockState(cart) {
      const { qualifyingTotal, giftsByTier } = this.calculateCartTotals(cart);

      const newTier = this.determineCurrentTier(qualifyingTotal);
      const oldTier = this.currentTier;

      const invalidGiftKeys = [];
      for (const [tierStr, itemKey] of Object.entries(giftsByTier || {})) {
        const tierNum = parseInt(tierStr, 10) || 0;
        if (tierNum > newTier) {
          invalidGiftKeys.push(itemKey);
        }
      }

      if (invalidGiftKeys.length > 0) {
        try {
          for (const key of invalidGiftKeys) {
            await this.removeGiftFromCart(key);
          }
          await this.refreshCart();
          this.currentTier = newTier;
          return;
        } catch (err) {
          console.error('Error removing invalid gift(s):', err);
        }
      }

      const giftStatusChanged = this.checkGiftStatusChanged(giftsByTier);

      if (newTier !== oldTier || giftStatusChanged) {
        this.currentTier = newTier;
        this.refreshGiftBlock();
      } else {
        this.updateProgressForNextTier(qualifyingTotal, newTier);
      }
    }

    determineCurrentTier(cartTotal) {
      if (!this.tiers || this.tiers.length === 0) return 0;

      for (let i = this.tiers.length - 1; i >= 0; i--) {
        if (cartTotal >= this.tiers[i].threshold) {
          return this.tiers[i].level;
        }
      }
      return 0;
    }

    checkGiftStatusChanged(currentGiftsByTier) {
      const oldGiftKeys = Object.keys(this.giftItems).sort().join(',');
      const newGiftKeys = Object.keys(currentGiftsByTier).sort().join(',');

      return oldGiftKeys !== newGiftKeys;
    }

    updateProgressForNextTier(cartTotal, currentTier) {
      const nextTier = this.tiers.find(t => t.level === currentTier + 1);

      if (!nextTier) return;

      const currentTierThreshold = this.tiers.find(t => t.level === currentTier)?.threshold || 0;
      const range = nextTier.threshold - currentTierThreshold;
      const current = cartTotal - currentTierThreshold;
      const progress = Math.min(100, (current / range) * 100);
      const remaining = Math.max(0, nextTier.threshold - cartTotal);

      this.updateProgressUI({ remaining, progress, cartTotal, currentTier });
    }

    updateProgressUI({ remaining, progress, cartTotal, currentTier }) {
      const progressBar = this.querySelector('[data-progress-bar]');
      if (progressBar) {
        progressBar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
      }

      const remainingMoneyEl = this.querySelector('[data-remaining-money]');
      if (remainingMoneyEl) {
        remainingMoneyEl.textContent = this.formatMoney(remaining);
      }

      this.querySelectorAll('.milestone').forEach((milestone, index) => {
        const tierLevel = index + 1;
        if (tierLevel <= currentTier) {
          milestone.classList.add('milestone--unlocked');
        } else {
          milestone.classList.remove('milestone--unlocked');
        }
      });

      const statusMessage = this.querySelector('[data-status-message]');
      if (statusMessage && this.tiers && this.tiers.length > 0) {
        this.updateStatusMessage(cartTotal, currentTier);
      }
    }

    updateStatusMessage(cartTotal, currentTier) {
      const statusMessage = this.querySelector('[data-status-message]');
      if (!statusMessage || !this.tiers || this.tiers.length === 0) return;

      const tier1 = this.tiers.find(tier => tier.level === 1);
      const tier2 = this.tiers.find(tier => tier.level === 2);

      let html = '';
      if (currentTier === 0 && tier1) {
        const remaining = Math.max(0, tier1.threshold - cartTotal);
        html = `<p class="text-sm"><strong>${this.formatMoney(remaining)}</strong> away from Free Shipping! 🚚</p>`;
      } else if (currentTier === 1 && tier2) {
        const remaining = Math.max(0, tier2.threshold - cartTotal);
        html = `<p class="text-sm text-emerald-600">🎉 Free Shipping unlocked! Add <strong>${this.formatMoney(remaining)}</strong> more for a FREE gift</p>`;
      } else if (currentTier >= 2) {
        html = '<p class="text-sm text-emerald-600 font-body-bolder">🎉 Congratulations! You\'ve unlocked all rewards!</p>';
      }

      if (html) {
        statusMessage.innerHTML = html;
      }
    }

    formatMoney(amountInCents) {
      const cents = Math.max(parseInt(amountInCents, 10) || 0, 0);
      if (window.Shopify?.formatMoney) {
        return window.Shopify.formatMoney(cents, this.moneyFormat || window.Shopify.money_format);
      }

      const amount = (cents / 100).toFixed(2);
      const template = this.moneyFormat || '${{amount}}';
      return template
        .replace('{{amount_with_comma_separator}}', amount.replace('.', ','))
        .replace('{{amount_no_decimals}}', Math.round(cents / 100).toString())
        .replace('{{amount}}', amount);
    }

    calculateCartTotals(cart) {
      if (!cart || !Array.isArray(cart.items)) {
        return { qualifyingTotal: 0, giftsByTier: {} };
      }

      return cart.items.reduce(
        (acc, item) => {
          const properties = item?.properties || {};
          const isGift =
            properties._free_gift === 'true' ||
            properties._free_gift === true ||
            properties['_free_gift'] === 'true';

          if (!isGift) {
            acc.qualifyingTotal += Number(item.final_line_price) || 0;
          } else {
            const tier = properties._gift_tier || properties['_gift_tier'];
            if (tier) {
              acc.giftsByTier[tier] = item.key;
            }
          }

          return acc;
        },
        { qualifyingTotal: 0, giftsByTier: {} }
      );
    }

    async fetchCartSnapshot() {
      try {
        const root = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${root}cart.js`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch cart data');
        const cart = await response.json();
        this.evaluateUnlockState(cart);
      } catch (error) {
        console.error('Error syncing cart state for free gift unlock:', error);
      }
    }

    async refreshGiftBlock() {
      if (this.isRefreshing || !this.sectionId) return;

      this.isRefreshing = true;

      try {
        const root = window.Shopify?.routes?.root || '/';
        const url = `${root}?sections=${encodeURIComponent(this.sectionId)}`;
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to refresh free gift section');

        const sectionHtml = await response.json();
        const htmlString = sectionHtml[this.sectionId];
        if (!htmlString) return;

        const temp = document.createElement('div');
        temp.innerHTML = htmlString;
        const updatedBlock = temp.querySelector(`free-gift-unlock[data-section-id="${this.sectionId}"]`);

        if (updatedBlock) {
          this.replaceWith(updatedBlock);
        }
      } catch (error) {
        console.error('Error refreshing free gift block:', error);
      } finally {
        this.isRefreshing = false;
      }
    }

    /* showOptimisticSuccessUI(tier) {
      const selector = this.querySelector('[data-tier-selector]');
      if (selector) {
        selector.innerHTML = `
          <div class="free-gift-selected">
            <div class="flex items-center gap-2 text-emerald-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="currentColor"/>
                <path d="M8 12L11 15L16 9" stroke="white" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="font-body-bolder">Gift selected!</span>
            </div>
            <button type="button" class="btn btn--plain text-sm" data-change-gift="${tier}">
              Change gift
            </button>
          </div>
        `;

        const changeBtn = selector.querySelector('[data-change-gift]');
        if (changeBtn) {
          changeBtn.addEventListener('click', () => this.refreshGiftBlock());
        }
      }
    } */

    async addGiftToCart() {
      if (!this.selectedVariantId) {
        console.warn('No gift selected');
        return;
      }

      const selectedItem = this.querySelector('.gift-card.gift-card--selected');

      if (!selectedItem) {
        console.warn('No gift item found');
        return;
      }

      const tier = selectedItem.dataset.giftTier;
      const productTitle = selectedItem.dataset.productTitle;

      if (!tier) {
        console.warn('No tier found for selected gift');
        return;
      }

      const addBtn = this.querySelector('[data-add-gift-btn]');

      if (addBtn) {
        addBtn.disabled = true;
        addBtn.classList.add('loading');
        addBtn.innerHTML = `
          <span class="btn__text" style="opacity: 0">Adding...</span>
          <span class="loading-spinner absolute inset-0 flex items-center justify-center">
            <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
              <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
        `;
      }

      /* this.showOptimisticSuccessUI(tier); */

      try {
        const removePromises = [];

        if (this.giftItems[tier]) {
          removePromises.push(this.removeGiftFromCart(this.giftItems[tier]));
        }

        const currentTierNum = parseInt(tier);
        for (const [giftTier, giftKey] of Object.entries(this.giftItems)) {
          if (parseInt(giftTier) < currentTierNum) {
            removePromises.push(this.removeGiftFromCart(giftKey));
          }
        }

        if (removePromises.length > 0) {
          await Promise.all(removePromises);
        }

        const response = await fetch((window.Shopify?.routes?.root || '/') + 'cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              id: parseInt(this.selectedVariantId, 10),
              quantity: 1,
              properties: {
                _free_gift: 'true',
                _gift_tier: tier,
                _gift_name: productTitle || ''
              }
            }]
          })
        });

        if (!response.ok) {
          throw new Error('Failed to add gift to cart');
        }

        this.refreshCartQuick();

      } catch (error) {
        console.error('Error adding gift to cart:', error);
        this.refreshGiftBlock();
      }
    }

    async removeGiftFromCart(identifier) {
      if (!identifier) return;

      try {
        await fetch((window.Shopify?.routes?.root || '/') + 'cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: identifier,
            quantity: 0
          })
        });
      } catch (error) {
        console.error('Error removing gift from cart:', error);
      }
    }

    async refreshCartQuick() {
      this.isManualUpdate = true;

      try {
        const root = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${root}cart.js`, {
          credentials: 'same-origin',
          cache: 'no-store'
        });

        if (response.ok) {
          const cart = await response.json();
          cart.sections = cart.sections || {};

          let sectionsToBundle = [];
          document.documentElement.dispatchEvent(
            new CustomEvent('cart:grouped-sections', {
              bubbles: true,
              detail: { sections: sectionsToBundle }
            })
          );

          if (this.sectionId && !sectionsToBundle.includes(this.sectionId)) {
            sectionsToBundle.push(this.sectionId);
          }

          if (sectionsToBundle.length > 0) {
            const sectionsResponse = await fetch(
              `${root}?sections=${sectionsToBundle.join(',')}`,
              { credentials: 'same-origin', cache: 'no-store' }
            );

            if (sectionsResponse.ok) {
              const sectionsHtml = await sectionsResponse.json();
              cart.sections = { ...cart.sections, ...sectionsHtml };
            }
          }

          document.dispatchEvent(
            new CustomEvent('cart:updated', {
              detail: { cart }
            })
          );

          if (window.FoxTheme?.pubsub?.publish) {
            window.FoxTheme.pubsub.publish(
              window.FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate,
              { cart }
            );
          }
        }
      } catch (error) {
        console.error('Error refreshing cart:', error);
      } finally {
        this.isManualUpdate = false;
      }
    }

    async refreshCart() {
      this.isManualUpdate = true;

      let sectionsToBundle = [];
      document.documentElement.dispatchEvent(
        new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections: sectionsToBundle } })
      );

      if (this.sectionId && !sectionsToBundle.includes(this.sectionId)) {
        sectionsToBundle.push(this.sectionId);
      }

      try {
        const root = window.Shopify?.routes?.root || '/';

        const response = await fetch(`${root}cart.js`, {
          credentials: 'same-origin',
          cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to fetch cart');
        const cart = await response.json();
        cart.sections = cart.sections || {};

        if (sectionsToBundle.length > 0) {
          const sectionsResponse = await fetch(
            `${root}?sections=${sectionsToBundle.join(',')}`,
            { credentials: 'same-origin', cache: 'no-store' }
          );

          if (sectionsResponse.ok) {
            const sectionsHtml = await sectionsResponse.json();
            cart.sections = { ...cart.sections, ...sectionsHtml };
          }
        }

        document.dispatchEvent(
          new CustomEvent('cart:updated', {
            detail: { cart }
          })
        );

        if (window.FoxTheme?.pubsub?.publish) {
          window.FoxTheme.pubsub.publish(
            window.FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate,
            { cart }
          );
        }

      } catch (error) {
        console.error('Error refreshing cart:', error);
      } finally {
        this.isManualUpdate = false;
      }
    }
  }

  customElements.define('free-gift-unlock', FreeGiftUnlock);
}