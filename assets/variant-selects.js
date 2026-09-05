if (!customElements.get('variant-selects')) {
  customElements.define(
    'variant-selects',
    class VariantSelects extends HTMLElement {
      constructor() {
        super();
      }

      get selectedOptionValues() {
        return Array.from(this.querySelectorAll('select option[selected], fieldset input:checked')).map(
          ({ dataset }) => dataset.optionValueId
        );
      }

      getInputForEventTarget(target) {
        return target.tagName === 'SELECT' ? target.selectedOptions[0] : target;
      }

      connectedCallback() {
        this.variantMatrix = this.getVariantMatrix();
        this.setupGroupedOptions();
        this.refreshOptionVisibility();

        this.addEventListener('change', (event) => {
          // Lựa chọn cha (option 1) quyết định các option con hợp lệ.
          // Nếu tổ hợp hiện tại không tồn tại, tự chọn lại option con hợp lệ đầu tiên.
          this.resolveDependentOptions(event.target);

          const target = this.getInputForEventTarget(event.target);
          this.updateSelectedSwatchValue(event);
          this.refreshOptionVisibility();
          this.syncGroupedParents();

          FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.optionValueSelectionChange, {
            data: {
              event,
              target,
              selectedOptionValues: this.selectedOptionValues,
            },
          });
        });
      }

      /* ------------------------------------------------------------------ *
       * Chọn 2 bước: option có tên dạng "Cha | Con"
       * Nút cha chỉ là lớp hiển thị — input thật vẫn là radio ở bước 2.
       * ------------------------------------------------------------------ */

      get groupedOptions() {
        return Array.from(this.querySelectorAll('[data-variant-parents]')).map((parentGroup) => ({
          parentGroup,
          childGroup: this.querySelector(`[data-variant-children="${parentGroup.dataset.variantParents}"]`),
        }));
      }

      setupGroupedOptions() {
        this.groupedOptions.forEach(({ parentGroup, childGroup }) => {
          if (!childGroup) return;

          // connectedCallback có thể chạy lại nếu element bị di chuyển trong DOM
          // (quick-view chẳng hạn) — không gắn listener trùng.
          if (parentGroup.dataset.groupedBound === 'true') return;
          parentGroup.dataset.groupedBound = 'true';

          parentGroup.addEventListener('change', (event) => {
            const input = event.target;
            if (!input.matches || !input.matches('input[type="radio"][data-parent-value]')) return;

            // Nút cha không phải option thật của Shopify, không được kích hoạt
            // luồng đổi variant. Việc đó do radio con đảm nhiệm.
            event.stopPropagation();
            this.onParentChange(parentGroup, childGroup, input.dataset.parentValue);
          });
        });

        this.syncGroupedParents();
      }

      onParentChange(parentGroup, childGroup, parentValue) {
        this.refreshChildVisibility(parentGroup, childGroup);

        const checked = childGroup.querySelector('input[type="radio"]:checked');
        if (checked && checked.dataset.parentValue === parentValue) return;

        const candidates = Array.from(childGroup.querySelectorAll('input[type="radio"]')).filter(
          (input) => input.dataset.parentValue === parentValue
        );
        const next = candidates.find((input) => !input.classList.contains('disabled')) || candidates[0];
        if (!next) return;

        next.checked = true;
        next.dispatchEvent(new Event('change', { bubbles: true }));
      }

      refreshChildVisibility(parentGroup, childGroup) {
        const parentInput = parentGroup.querySelector('input[type="radio"]:checked');
        const parentValue = parentInput ? parentInput.dataset.parentValue : null;

        childGroup.querySelectorAll('input[type="radio"]').forEach((input) => {
          const owner = input.dataset.parentValue;
          // Giá trị không có dấu '|' thì không thuộc cha nào — luôn hiển thị.
          // Chưa chọn được cha nào thì hiện tất cả, không ẩn nhầm.
          const hide = Boolean(owner) && Boolean(parentValue) && owner !== parentValue;

          input.classList.toggle('variant-option--hidden-group', hide);
          const label = input.nextElementSibling;
          if (label && label.tagName === 'LABEL') {
            label.classList.toggle('variant-option--hidden-group', hide);
          }
        });

        if (!parentValue) return;

        // Tên option chỉ là cờ đánh dấu ("Package | Plus") → nhãn bước 2 lấy tên cha đang chọn.
        if (parentGroup.dataset.markerMode === 'true') {
          const groupLabel = childGroup.querySelector('[data-child-group-label]');
          if (groupLabel) groupLabel.textContent = `${parentValue}:`;
        }

        const parentLabel = parentGroup.querySelector('[data-selected-parent-value]');
        if (parentLabel) parentLabel.textContent = parentValue;
      }

      syncGroupedParents() {
        this.groupedOptions.forEach(({ parentGroup, childGroup }) => {
          if (!childGroup) return;

          const checked = childGroup.querySelector('input[type="radio"]:checked');
          const parentValue = checked ? checked.dataset.parentValue : null;

          if (parentValue) {
            const parentInput = Array.from(parentGroup.querySelectorAll('input[type="radio"]')).find(
              (input) => input.dataset.parentValue === parentValue
            );
            if (parentInput && !parentInput.checked) parentInput.checked = true;
          }

          this.refreshChildVisibility(parentGroup, childGroup);
        });
      }

      /* ------------------------------------------------------------------ *
       * Ma trận variant
       * ------------------------------------------------------------------ */

      getVariantMatrix() {
        const source = this.querySelector('[data-variant-matrix]');
        if (!source) return [];

        try {
          const parsed = JSON.parse(source.textContent);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.error('variant-selects: cannot parse variant matrix', error);
          return [];
        }
      }

      get optionGroups() {
        return Array.from(this.querySelectorAll('[data-option-position]'));
      }

      optionNodes(group) {
        const select = group.querySelector('select');
        if (select) return Array.from(select.options);
        return Array.from(group.querySelectorAll('input[type="radio"]'));
      }

      selectedValueOf(group) {
        const select = group.querySelector('select');
        if (select) {
          const option = select.options[select.selectedIndex];
          return option ? option.value : null;
        }

        const checked = group.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : null;
      }

      matchesValues(variant, values) {
        return values.every((value, index) => value == null || variant.options[index] === value);
      }

      findVariant(values) {
        return this.variantMatrix.find((variant) => this.matchesValues(variant, values));
      }

      /* ------------------------------------------------------------------ *
       * Ẩn các option con không tồn tại với lựa chọn cha hiện tại
       * ------------------------------------------------------------------ */

      refreshOptionVisibility() {
        const groups = this.optionGroups;
        if (!this.variantMatrix.length || groups.length < 2) return;

        const selected = groups.map((group) => this.selectedValueOf(group));

        groups.forEach((group, index) => {
          // Chỉ ràng buộc bởi các option đứng trước (option cha),
          // nên option đầu tiên luôn hiển thị đầy đủ.
          const prefix = selected.map((value, position) => (position < index ? value : null));
          const allowed = new Set(
            this.variantMatrix
              .filter((variant) => this.matchesValues(variant, prefix))
              .map((variant) => variant.options[index])
          );

          this.optionNodes(group).forEach((node) => {
            this.toggleOptionNode(node, !allowed.has(node.value));
          });
        });
      }

      toggleOptionNode(node, hide) {
        node.classList.toggle('variant-option--hidden', hide);

        if (node.tagName === 'OPTION') {
          node.hidden = hide;
          node.disabled = hide;
          return;
        }

        const label = node.nextElementSibling;
        if (label && label.tagName === 'LABEL') {
          label.classList.toggle('variant-option--hidden', hide);
        }
      }

      /* ------------------------------------------------------------------ *
       * Tự chọn lại option con khi đổi option cha
       * ------------------------------------------------------------------ */

      resolveDependentOptions(eventTarget) {
        const groups = this.optionGroups;
        if (!this.variantMatrix.length || groups.length < 2) return;

        const changedGroup = eventTarget.closest('[data-option-position]');
        const changedIndex = groups.indexOf(changedGroup);
        if (changedIndex === -1) return;

        const selected = groups.map((group) => this.selectedValueOf(group));
        if (this.findVariant(selected)) return;

        // Ưu tiên giữ nguyên các option đứng trước; nếu vẫn không ra tổ hợp
        // hợp lệ thì cho phép chọn lại cả các option đó.
        const resolved =
          this.resolveSelection(groups, selected, changedIndex, true) ||
          this.resolveSelection(groups, selected, changedIndex, false);
        if (!resolved) return;

        resolved.forEach((value, index) => {
          if (index === changedIndex || value === selected[index]) return;
          this.selectOptionValue(groups[index], value);
        });
      }

      resolveSelection(groups, selected, changedIndex, keepPrecedingOptions) {
        const resolved = groups.map((group, index) => {
          if (index === changedIndex) return selected[index];
          if (index < changedIndex && keepPrecedingOptions) return selected[index];
          return null;
        });

        for (let index = 0; index < groups.length; index++) {
          if (resolved[index] != null) continue;

          const pool = this.variantMatrix.filter((variant) => this.matchesValues(variant, resolved));
          const values = this.optionNodes(groups[index])
            .map((node) => node.value)
            .filter((value) => pool.some((variant) => variant.options[index] === value));
          if (!values.length) return null;

          const isAvailable = (value) =>
            pool.some((variant) => variant.options[index] === value && variant.available);

          resolved[index] =
            (values.includes(selected[index]) && isAvailable(selected[index]) ? selected[index] : null) ||
            values.find(isAvailable) ||
            values[0];
        }

        return this.findVariant(resolved) ? resolved : null;
      }

      selectOptionValue(group, value) {
        const select = group.querySelector('select');
        let displayValue = value;

        if (select) {
          const option = Array.from(select.options).find((item) => item.value === value);
          if (!option) return;

          Array.from(select.options).forEach((item) => item.removeAttribute('selected'));
          option.setAttribute('selected', 'selected');
          select.value = value;
        } else {
          const input = Array.from(group.querySelectorAll('input[type="radio"]')).find(
            (item) => item.value === value
          );
          if (!input) return;

          input.checked = true;
          displayValue = input.dataset.childValue || value;
        }

        const selectedLabel = group.querySelector('[data-selected-swatch-value]');
        if (selectedLabel) selectedLabel.textContent = displayValue;
      }

      /* ------------------------------------------------------------------ */

      updateSelectedSwatchValue({ target }) {
        const { value, tagName } = target;

        if (tagName === 'SELECT' && target.selectedOptions.length) {
          Array.from(target.options)
            .find((option) => option.getAttribute('selected'))
            ?.removeAttribute('selected');
          target.selectedOptions[0].setAttribute('selected', 'selected');

          const swatchValue = target.selectedOptions[0].dataset.optionSwatchValue;
          const selectedDropdownSwatchValue = target
            .closest('.product-form__input')
            .querySelector('[data-selected-value] > .swatch');
          if (!selectedDropdownSwatchValue) return;
          if (swatchValue) {
            selectedDropdownSwatchValue.style.setProperty('--swatch--background', swatchValue);
            selectedDropdownSwatchValue.classList.remove('swatch--unavailable');
          } else {
            selectedDropdownSwatchValue.style.setProperty('--swatch--background', 'unset');
            selectedDropdownSwatchValue.classList.add('swatch--unavailable');
          }

          selectedDropdownSwatchValue.style.setProperty(
            '--swatch-focal-point',
            target.selectedOptions[0].dataset.optionSwatchFocalPoint || 'unset'
          );
        } else if (tagName === 'INPUT' && target.type === 'radio') {
          // Option chọn 2 bước chỉ hiện phần con, không hiện chuỗi "Cha | Con".
          const displayValue = target.dataset.childValue || value;
          const wrapper = target.closest(`.product-form__input`);
          const selectedSwatchValue = wrapper?.querySelector('[data-selected-value]');
          if (selectedSwatchValue) selectedSwatchValue.innerHTML = displayValue;

          const selectedLabel = wrapper?.querySelector('[data-selected-swatch-value]');
          if (selectedLabel) selectedLabel.textContent = displayValue;
        }
      }
    }
  );
}
