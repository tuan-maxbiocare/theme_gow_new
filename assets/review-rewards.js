// Review and Rewards Page JavaScript
(function () {
    'use strict';

    // Initialize when DOM is ready
    function init() {
        initPlatformSelection();
        initProductSearch();
        initReviewPopup();
        initReviewButtons();
    }

    // Platform selection logic
    function initPlatformSelection() {
        const platformSelection = document.getElementById('platform-selection');
        const gowSection = document.getElementById('gow-search-section');
        const backBtnGOW = document.getElementById('back-to-selection');

        if (!platformSelection || !gowSection || !backBtnGOW) return;

        // Platform buttons
        document.querySelectorAll('.platform-btn').forEach((btn) => {
            btn.addEventListener('click', function () {
                const platform = this.dataset.platform;

                if (platform === 'gow') {
                    platformSelection.style.display = 'none';
                    gowSection.style.display = 'block';
                } else if (platform === 'cw') {
                    // Open Klaviyo form directly
                    window._klOnsite = window._klOnsite || [];
                    window._klOnsite.push(['openForm', 'RvvfAP']);
                }
            });
        });

        // Back button GOW
        backBtnGOW.addEventListener('click', function () {
            gowSection.style.display = 'none';
            platformSelection.style.display = 'grid';

            // Clear search
            const searchInput = document.getElementById('product-search-input');
            const searchResults = document.getElementById('search-results');
            if (searchInput) searchInput.value = '';
            if (searchResults) searchResults.style.display = 'none';
        });
    }

    // Product search functionality
    function initProductSearch() {
        const searchInput = document.getElementById('product-search-input');
        const searchResults = document.getElementById('search-results');

        if (!searchInput || !searchResults) return;
        searchInput.addEventListener('focus', function () {
            loadSuggestedProducts(searchResults);
        });

        let debounceTimer;

        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const query = this.value.trim();

            if (query.length < 1) {
                searchResults.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(() => {
                searchProducts(query, searchResults);
            }, 300);
        });

        // Click outside search to close
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.page-review-reward__search')) {
                searchResults.style.display = 'none';
            }
        });
    }

    // Search products via API
    async function searchProducts(query, searchResults) {
        try {
            const response = await fetch(
                `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`
            );
            const data = await response.json();

            const filteredProducts = (data.resources.results.products || []).filter((product) => {
                return !product.title.includes('CW') && !product.title.includes('cw');
            });

            displayResults(filteredProducts.slice(0, 5), searchResults);
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML =
                '<div style="padding: 15px; text-align: center; color: #999;">Error loading results</div>';
            searchResults.style.display = 'block';
        }
    }
    async function loadSuggestedProducts(searchResults) {
        try {
            const response = await fetch(
                `/search/suggest.json?q=a&resources[type]=product&resources[limit]=10`
            );

            const data = await response.json();
            const products = data.resources.results.products || [];

            // Remove CW products
            const filteredProducts = products.filter(
                (p) => !p.title.includes('CW') && !p.title.includes('cw')
            );

            displayResults(filteredProducts.slice(0, 5), searchResults);
        } catch (error) {
            console.error('Error loading suggestions:', error);
        }
    }

    // Display search results
    function displayResults(products, searchResults) {
        if (products.length === 0) {
            searchResults.innerHTML =
                '<div style="padding: 15px; text-align: center; color: #999;">No products found</div>';
            searchResults.style.display = 'block';
            return;
        }

        searchResults.innerHTML = products
            .map(
                (product) => `
          <div class="search-result__item" data-handle="${product.handle}">
            <img src="${product.image}" alt="${product.title}" class="search-result__image" onerror="this.style.display='none'">
            <div class="search-result__info">
              <div class="search-result__title">${product.title}</div>
            </div>
          </div>
        `
            )
            .join('');

        searchResults.style.display = 'block';

        // Add click handlers to search results
        document.querySelectorAll('.search-result__item').forEach((item) => {
            item.addEventListener('click', async function () {
                const handle = this.dataset.handle;
                this.classList.add('loading');
                await openReviewForProduct(handle);
                this.classList.remove('loading');
            });
        });
    }

    // Open review for selected product
    async function openReviewForProduct(handle) {
        try {
            const response = await fetch(`/products/${handle}?view=review-url&t=${Date.now()}`);

            if (!response.ok) {
                throw new Error('Failed to fetch product');
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const reviewUrlElement = doc.querySelector('[data-review-url]');
            const reviewUrl = reviewUrlElement ? reviewUrlElement.dataset.reviewUrl : null;

            if (reviewUrl && reviewUrl.trim() !== '') {
                openReviewPopup(reviewUrl);
            } else {
                alert('Review link not available for this product');
            }
        } catch (error) {
            console.error('Failed to load review URL:', error);
            alert('Failed to load review link. Please try again.');
        }
    }

    // Open review popup
    function openReviewPopup(url) {
        const popup = document.getElementById('review-popup');
        const iframe = document.getElementById('review-iframe');

        if (!popup || !iframe) return;

        iframe.src = '';
        setTimeout(() => {
            iframe.src = url;
        }, 100);

        popup.classList.add('active');
    }

    // Initialize review popup handlers
    function initReviewPopup() {
        const popup = document.getElementById('review-popup');
        const iframe = document.getElementById('review-iframe');

        if (!popup || !iframe) return;

        // Move popup to be a direct child of <body> so its fixed positioning
        // can't be clipped/trapped by ancestor wrappers (e.g. .site-wrapper's overflow: clip)
        if (popup.parentElement !== document.body) {
            document.body.appendChild(popup);
        }

        const closeBtn = popup.querySelector('.review-popup__close');
        const overlay = popup.querySelector('.review-popup__overlay');

        const closePopup = () => {
            popup.classList.remove('active');
            iframe.src = '';
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', closePopup);
        }

        if (overlay) {
            overlay.addEventListener('click', closePopup);
        }
    }

    // Initialize review buttons
    function initReviewButtons() {
        document.querySelectorAll('.page-review-reward__button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const link = btn.getAttribute('data-link');
                if (link) {
                    window.open(link, '_blank');
                }
            });
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();