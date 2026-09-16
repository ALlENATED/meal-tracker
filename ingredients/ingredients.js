/* ============================================================
   INGREDIENTS BEHAVIOR — ingredients.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - rendering the Ingredients tab (grouped by category), search,
       selecting/bulk-moving/bulk-deleting ingredients
     - the "Edit Category" / "New Category" popups (create, rename,
       change icon, delete a category)
     - the "Add/Edit Ingredient" popup (create, edit, delete a
       single ingredient). Its camera button hands off to
       food-scanner/food-scanner.js instead (openScanModal('ingredient'))
       — that's what fills in this popup's Name/macro fields when a
       scan is used; saveIngredient() below still does the actual
       creating/updating, unchanged

   DEPENDS ON OTHER FILES:
     - food-database/ingredient-list.js for CATEGORIES, CATEGORY_MAP,
       INGREDIENTS, CAT_ICON_OPTIONS
     - shared/app-data-and-settings.js for saveState(), saveCategories(),
       and calls renderCategorySettings() (defined there, used inside
       the Settings popup) after categories change

   SAFE TO REWORK ALONE?
   Yes, together with ingredients/ingredients.css and the marked
   HTML blocks for the Ingredients tab and its popups in index.html.
   ============================================================ */

// ============================================================
//  INGREDIENTS TAB
// ============================================================
function renderIngredients(filter = '') {
    const container = document.getElementById('ingredientGrid');
    const filtered = INGREDIENTS.filter(i =>
        i.name.toLowerCase().includes(filter.toLowerCase())
    );
    document.getElementById('ingredientCount').innerText = filtered.length;

    const bulkSelect = document.getElementById('bulkCategorySelect');
    bulkSelect.innerHTML = '<option value="">Move to category...</option>';
    CATEGORIES.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = (c.icon || '📁') + ' ' + c.name;
        bulkSelect.appendChild(opt);
    });

    if (filtered.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted); padding:20px; text-align:center;">No ingredients found</div>';
        return;
    }

    const grouped = {};
    filtered.forEach(i => {
        if (!grouped[i.category]) grouped[i.category] = [];
        grouped[i.category].push(i);
    });

    let html = '';
    for (const cat of CATEGORIES) {
        if (grouped[cat.name]) {
            const icon = cat.icon || '📁';
            html += `<div class="category-section">
                <div class="cat-title">
                    <span class="cat-icon">${icon}</span> ${cat.name}
                    <span class="cat-actions">
                        <button onclick="openEditCategoryModal('${cat.name}')" title="Edit category"><i class="fas fa-edit"></i></button>
                    </span>
                </div>
                <div class="cat-grid">`;
            grouped[cat.name].forEach((i) => {
                const globalIdx = INGREDIENTS.indexOf(i);
                const isChecked = ingredientSelection.has(globalIdx);
                html += `<div class="ingredient-card">
                    <div class="card-actions">
                        <button onclick="openEditIngredientModal(${globalIdx})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteIngredientPrompt(${globalIdx})" title="Delete"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    <div class="name">
                        <input type="checkbox" ${isChecked?'checked':''} onchange="toggleIngredientSelection(${globalIdx}, this.checked)">
                        ${i.name}
                    </div>
                    <div class="details">
                        <span><i class="fas fa-fire"></i> ${i.kcal} kcal</span>
                        <span><i class="fas fa-drumstick-bite"></i> ${i.protein}g</span>
                        <span><i class="fas fa-bread-slice"></i> ${i.carbs}g</span>
                        <span><i class="fas fa-droplet"></i> ${i.fat}g</span>
                        <span><i class="fas fa-seedling"></i> ${i.fiber}g</span>
                        <span><i class="fas fa-cube"></i> ${i.sugar}g</span>
                        ${i.unit ? `<span><i class="fas fa-hashtag"></i> ${i.unit}</span>` : ''}
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        }
    }
    container.innerHTML = html;
    updateSelectedCount();
}

function toggleIngredientSelection(idx, checked) {
    if (checked) {
        ingredientSelection.add(idx);
    } else {
        ingredientSelection.delete(idx);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    document.getElementById('selectedCount').innerText = ingredientSelection.size + ' selected';
}

function toggleSelectAll() {
    const filtered = INGREDIENTS.filter(i =>
        i.name.toLowerCase().includes(document.getElementById('ingredientSearch').value.toLowerCase())
    );
    const allSelected = filtered.every(i => ingredientSelection.has(INGREDIENTS.indexOf(i)));
    filtered.forEach(i => {
        const idx = INGREDIENTS.indexOf(i);
        if (allSelected) {
            ingredientSelection.delete(idx);
        } else {
            ingredientSelection.add(idx);
        }
    });
    renderIngredients(document.getElementById('ingredientSearch').value);
}

function clearSelection() {
    ingredientSelection.clear();
    renderIngredients(document.getElementById('ingredientSearch').value);
}

function bulkMoveIngredients() {
    const targetCat = document.getElementById('bulkCategorySelect').value;
    if (!targetCat) {
        alert('Please select a category to move to.');
        return;
    }
    if (ingredientSelection.size === 0) {
        alert('No ingredients selected.');
        return;
    }
    if (!confirm(`Move ${ingredientSelection.size} ingredients to "${targetCat}"?`)) return;
    ingredientSelection.forEach(idx => {
        INGREDIENTS[idx].category = targetCat;
    });
    ingredientSelection.clear();
    saveState();
    renderIngredients(document.getElementById('ingredientSearch').value);
    alert('Ingredients moved successfully!');
}

function bulkDeleteIngredients() {
    if (ingredientSelection.size === 0) {
        alert('No ingredients selected.');
        return;
    }
    if (!confirm(`Delete ${ingredientSelection.size} selected ingredients? This cannot be undone.`)) return;
    const sorted = Array.from(ingredientSelection).sort((a, b) => b - a);
    sorted.forEach(idx => {
        rememberDeletedIngredient(INGREDIENTS[idx].name);
        INGREDIENTS.splice(idx, 1);
    });
    ingredientSelection.clear();
    saveState();
    renderIngredients(document.getElementById('ingredientSearch').value);
    alert('Ingredients deleted successfully!');
}

function filterIngredients() {
    renderIngredients(document.getElementById('ingredientSearch').value);
}

// ============================================================
//  CATEGORY EDITING
// ============================================================
let editingCategoryName = null;

function openEditCategoryModal(catName) {
    editingCategoryName = catName;
    const cat = CATEGORIES.find(c => c.name === catName);
    if (!cat) return;
    document.getElementById('catEditName').value = cat.name;
    document.getElementById('catSelectedIcon').textContent = cat.icon || '📁';
    document.getElementById('catDeleteBtn').style.display = 'inline-block';
    const picker = document.getElementById('catIconPicker');
    picker.innerHTML = CAT_ICON_OPTIONS.map(icon =>
        `<button class="${icon === cat.icon ? 'selected' : ''}" onclick="selectCatIcon('${icon}')">${icon}</button>`
    ).join('');
    document.getElementById('editCategoryModal').classList.add('show');
}

function openAddCategoryModal() {
    editingCategoryName = null;
    document.getElementById('catEditName').value = '';
    document.getElementById('catSelectedIcon').textContent = '📁';
    document.getElementById('catDeleteBtn').style.display = 'none';
    const picker = document.getElementById('catIconPicker');
    picker.innerHTML = CAT_ICON_OPTIONS.map(icon =>
        `<button onclick="selectCatIcon('${icon}')">${icon}</button>`
    ).join('');
    document.getElementById('editCategoryModal').classList.add('show');
}

function selectCatIcon(icon) {
    document.getElementById('catSelectedIcon').textContent = icon;
    document.querySelectorAll('#catIconPicker button').forEach(b => {
        b.classList.toggle('selected', b.textContent === icon);
    });
}

function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('show');
}

function saveCategory() {
    const name = document.getElementById('catEditName').value.trim();
    const icon = document.getElementById('catSelectedIcon').textContent || '📁';
    if (!name) {
        alert('Please enter a category name.');
        return;
    }
    if (editingCategoryName) {
        const idx = CATEGORIES.findIndex(c => c.name === editingCategoryName);
        if (idx !== -1) {
            const oldName = editingCategoryName;
            INGREDIENTS.forEach(i => {
                if (i.category === oldName) i.category = name;
            });
            CATEGORIES[idx] = { name, icon };
        }
    } else {
        if (CATEGORIES.find(c => c.name === name)) {
            alert('Category already exists.');
            return;
        }
        CATEGORIES.push({ name, icon });
    }
    saveCategories();
    closeEditCategoryModal();
    renderIngredients(document.getElementById('ingredientSearch').value);
    renderCategorySettings();
    populateCategorySelect(document.getElementById('ingEditCategory').value);
}

function deleteCategory() {
    if (!editingCategoryName) return;
    if (!confirm(`Delete category "${editingCategoryName}"? All ingredients in this category will be moved to "Other".`))
        return;
    const otherCat = CATEGORIES.find(c => c.name === 'Other') || CATEGORIES[0];
    INGREDIENTS.forEach(i => {
        if (i.category === editingCategoryName) i.category = otherCat.name;
    });
    CATEGORIES = CATEGORIES.filter(c => c.name !== editingCategoryName);
    saveCategories();
    closeEditCategoryModal();
    renderIngredients(document.getElementById('ingredientSearch').value);
    renderCategorySettings();
    populateCategorySelect(document.getElementById('ingEditCategory').value);
}

// ============================================================
//  INGREDIENT CRUD
// ============================================================
function openAddIngredientModal() {
    editingIngredientIndex = null;
    document.getElementById('ingredientEditTitle').innerText = 'Add Ingredient';
    document.getElementById('ingEditName').value = '';
    document.getElementById('ingEditKcal').value = '';
    document.getElementById('ingEditProtein').value = '';
    document.getElementById('ingEditCarbs').value = '';
    document.getElementById('ingEditFat').value = '';
    document.getElementById('ingEditFiber').value = '';
    document.getElementById('ingEditSugar').value = '';
    document.getElementById('ingEditUnit').value = 'g';
    document.getElementById('ingDeleteBtn').style.display = 'none';
    populateCategorySelect();
    document.getElementById('ingredientEditModal').classList.add('show');
}

function openEditIngredientModal(idx) {
    editingIngredientIndex = idx;
    const ing = INGREDIENTS[idx];
    if (!ing) return;
    document.getElementById('ingredientEditTitle').innerText = 'Edit Ingredient';
    document.getElementById('ingEditName').value = ing.name;
    document.getElementById('ingEditKcal').value = ing.kcal;
    document.getElementById('ingEditProtein').value = ing.protein;
    document.getElementById('ingEditCarbs').value = ing.carbs;
    document.getElementById('ingEditFat').value = ing.fat;
    document.getElementById('ingEditFiber').value = ing.fiber;
    document.getElementById('ingEditSugar').value = ing.sugar || 0;
    document.getElementById('ingEditUnit').value = ing.unit || 'g';
    document.getElementById('ingDeleteBtn').style.display = 'inline-block';
    populateCategorySelect(ing.category);
    document.getElementById('ingredientEditModal').classList.add('show');
}

function closeIngredientEditModal() {
    document.getElementById('ingredientEditModal').classList.remove('show');
}

function populateCategorySelect(selected = '') {
    const sel = document.getElementById('ingEditCategory');
    sel.innerHTML = '';
    CATEGORIES.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = (c.icon || '📁') + ' ' + c.name;
        if (c.name === selected) opt.selected = true;
        sel.appendChild(opt);
    });
}

function openNewCategoryWithIcon() {
    document.getElementById('newCatName').value = '';
    document.getElementById('newCatSelectedIcon').textContent = '📁';
    const picker = document.getElementById('newCatIconPicker');
    picker.innerHTML = CAT_ICON_OPTIONS.map(icon =>
        `<button onclick="selectNewCatIcon('${icon}')">${icon}</button>`
    ).join('');
    document.getElementById('newCategoryModal').classList.add('show');
}

function selectNewCatIcon(icon) {
    document.getElementById('newCatSelectedIcon').textContent = icon;
    document.querySelectorAll('#newCatIconPicker button').forEach(b => {
        b.classList.toggle('selected', b.textContent === icon);
    });
}

function closeNewCategoryModal() {
    document.getElementById('newCategoryModal').classList.remove('show');
}

function confirmNewCategory() {
    const name = document.getElementById('newCatName').value.trim();
    const icon = document.getElementById('newCatSelectedIcon').textContent || '📁';
    if (!name) {
        alert('Please enter a category name.');
        return;
    }
    if (CATEGORIES.find(c => c.name === name)) {
        alert('Category already exists.');
        return;
    }
    CATEGORIES.push({ name, icon });
    saveCategories();
    closeNewCategoryModal();
    populateCategorySelect(name);
    renderCategorySettings();
    renderIngredients(document.getElementById('ingredientSearch').value);
}

function saveIngredient() {
    const name = document.getElementById('ingEditName').value.trim();
    const kcal = parseFloat(document.getElementById('ingEditKcal').value);
    const protein = parseFloat(document.getElementById('ingEditProtein').value) || 0;
    const carbs = parseFloat(document.getElementById('ingEditCarbs').value) || 0;
    const fat = parseFloat(document.getElementById('ingEditFat').value) || 0;
    const fiber = parseFloat(document.getElementById('ingEditFiber').value) || 0;
    const sugar = parseFloat(document.getElementById('ingEditSugar').value) || 0;
    const unit = document.getElementById('ingEditUnit').value;
    const category = document.getElementById('ingEditCategory').value;

    if (!name || isNaN(kcal) || kcal < 0) {
        alert('Please fill in all fields correctly.');
        return;
    }

    const ingData = { name, kcal, protein, carbs, fat, fiber, sugar, unit, category };

    // if this name was deleted before, adding it back un-deletes it
    forgetDeletedIngredient(name);

    if (editingIngredientIndex !== null) {
        INGREDIENTS[editingIngredientIndex] = ingData;
    } else {
        INGREDIENTS.push(ingData);
    }
    closeIngredientEditModal();
    renderIngredients(document.getElementById('ingredientSearch').value);
    saveState();
}

function deleteIngredientPrompt(idx) {
    if (!confirm(`Delete "${INGREDIENTS[idx].name}"?`)) return;
    rememberDeletedIngredient(INGREDIENTS[idx].name);
    INGREDIENTS.splice(idx, 1);
    ingredientSelection.delete(idx);
    renderIngredients(document.getElementById('ingredientSearch').value);
    saveState();
}

function deleteIngredient() {
    if (editingIngredientIndex === null) return;
    if (!confirm(`Delete "${INGREDIENTS[editingIngredientIndex].name}"?`)) return;
    rememberDeletedIngredient(INGREDIENTS[editingIngredientIndex].name);
    INGREDIENTS.splice(editingIngredientIndex, 1);
    ingredientSelection.delete(editingIngredientIndex);
    closeIngredientEditModal();
    renderIngredients(document.getElementById('ingredientSearch').value);
    saveState();
}