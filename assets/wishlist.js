class WishlistManager {
  constructor() {
    this.storageKey = 'customerWishlist';
    this.wishlistItems = this.getWishlist();
    this.initButtons();
  }

  initButtons() {
    const buttons = document.querySelectorAll('.wishlist-button');
    buttons.forEach(button => {
      const productId = button.dataset.productId;
      if (this.wishlistItems.includes(productId)) {
        button.setAttribute('data-active', 'true');
      }
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleWishlistItem(productId, button);
      });
    });
  }

  toggleWishlistItem(productId, button) {
    const index = this.wishlistItems.indexOf(productId);
    if (index > -1) {
      this.wishlistItems.splice(index, 1);
      button.setAttribute('data-active', 'false');
    } else {
      this.wishlistItems.push(productId);
      button.setAttribute('data-active', 'true');
    }
    this.saveWishlist();
  }

  getWishlist() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : [];
  }

  saveWishlist() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.wishlistItems));
  }
}

// Initialize wishlist
document.addEventListener('DOMContentLoaded', () => {
  window.wishlist = new WishlistManager();
});