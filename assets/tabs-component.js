document.addEventListener("DOMContentLoaded", function() {
  const tabsNav = document.querySelectorAll('.tabs__nav button[role="tab"]');

  // Lấy index hiện tại
  function getCurrentIndex() {
    return [...tabsNav].findIndex(btn => btn.classList.contains('is-active') || btn.getAttribute('aria-selected') === "true");
  }

  // Chuyển tab bằng click
  function goToTab(index) {
    if (index < 0) index = tabsNav.length - 1;
    if (index >= tabsNav.length) index = 0;
    tabsNav[index].click(); // dùng event click gốc của theme
  }

  // Prev
  document.querySelectorAll('.custom-arrow-prev').forEach(prevBtn => {
    prevBtn.addEventListener('click', function() {
      goToTab(getCurrentIndex() - 1);
    });
  });

  // Next
  document.querySelectorAll('.custom-arrow-next').forEach(nextBtn => {
    nextBtn.addEventListener('click', function() {
      goToTab(getCurrentIndex() + 1);
    });
  });
});