/* ============================================================
   SAVED MEALS BEHAVIOR — saved-meals.js
   ============================================================
   WHAT THIS FILE CONTROLS:
     - rendering the Saved Meals tab grid
     - the "Save/Edit Meal" popup: naming a meal, picking an icon,
       adding/removing items, instructions, picture upload/URL,
       saving or deleting the meal
     - the "Select Ingredient" popup used while building a meal
       (search, pick, set amount, add to the meal)

   DEPENDS ON OTHER FILES:
     - food-database/ingredient-list.js for INGREDIENTS, CATEGORIES,
       MEAL_ICONS
     - shared/app-data-and-settings.js for savedMeals, dailyLog,
       parseAmount()

   SAFE TO REWORK ALONE?
   Yes, together with saved-meals/saved-meals.css and the marked
   HTML blocks for the Saved Meals tab and its popups in index.html.
   ============================================================ */

// ============================================================
//  SAVED MEALS with picture upload
// ============================================================
function renderSavedMeals() {
    document.getElementById('savedCount').innerText = savedMeals.length;
    renderSavedMealsFilterPills();

    const container = document.getElementById('savedMealGrid');
    if (savedMeals.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted); font-style:italic; padding:16px 0;">No saved meals yet. Create one from the Dashboard!</div>';
        return;
    }

    // Every meal alongside its real index into `savedMeals` — kept together
    // so the card's edit/delete buttons always act on the right meal even
    // once the list below has been filtered and/or split into group
    // sections for display.
    const withIdx = savedMeals.map((m, i) => ({ m, i }));
    const filtered = savedMealsActiveFilter === 'all' ? withIdx
        : savedMealsActiveFilter === 'ungrouped' ? withIdx.filter(({ m }) => !m.groupId)
        : withIdx.filter(({ m }) => m.groupId === savedMealsActiveFilter);

    if (filtered.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted); font-style:italic; padding:16px 0;">No meals in this group yet.</div>';
        return;
    }

    // Filtered down to one specific group (or Ungrouped) — just a single
    // flat grid, no group headers needed since it's already all one group.
    if (savedMealsActiveFilter !== 'all') {
        container.innerHTML = `<div class="saved-meal-grid">${filtered.map(renderMealCard).join('')}</div>`;
        return;
    }

    // "All": show every group as its own section (in the order groups were
    // created), with a final "Ungrouped" section for any meal that isn't in
    // one — same collapsible-by-category idea used elsewhere in this app,
    // just always-expanded here since the Saved Meals tab has more room
    // than the Add Food popup's picker does.
    let html = '';
    mealGroups.forEach(g => {
        const items = filtered.filter(({ m }) => m.groupId === g.id);
        if (items.length === 0) return;
        html += `<div class="meal-group-section-header"><span class="grp-icon">${g.icon || '🍽️'}</span> <span>${g.name}</span> <span class="grp-count">${items.length}</span></div>`;
        html += `<div class="saved-meal-grid">${items.map(renderMealCard).join('')}</div>`;
    });
    const ungrouped = filtered.filter(({ m }) => !m.groupId);
    if (ungrouped.length > 0) {
        html += `<div class="meal-group-section-header"><span class="grp-icon">🍽️</span> <span>Ungrouped</span> <span class="grp-count">${ungrouped.length}</span></div>`;
        html += `<div class="saved-meal-grid">${ungrouped.map(renderMealCard).join('')}</div>`;
    }
    container.innerHTML = html;
}

// Builds one saved-meal card. Takes {m, i} (the meal plus its real index
// into `savedMeals`) rather than the two separately, so it can be handed
// straight to .map() over any already-filtered/grouped list from
// renderSavedMeals() above without losing track of the real index.
function renderMealCard({ m, i }) {
    const totalKcal = m.items.reduce((s, it) => s + it.kcal, 0);
    const icon = m.icon || '🍽️';
    const hasPic = m.pictureDataURL && m.pictureDataURL.length > 0;
    const picHtml = hasPic ?
        `<div class="meal-pic"><img src="${m.pictureDataURL}" alt="${m.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'no-pic\\'>no image</div>'"></div>` :
        `<div class="meal-pic"><div class="no-pic">📷 no image</div></div>`;
    const instrHtml = m.instructions && m.instructions.trim().length > 0 ?
        `<div class="instructions">${m.instructions}</div>` :
        '';
    // Only shown for a meal with a "Total cooked weight" set — a quick
    // visual flag, from the Saved Meals tab itself, of which meals will
    // ask for a portion size (vs. log the whole thing instantly) when
    // added from the Dashboard's Add Food popup.
    const cookedWeightHtml = m.cookedWeight ?
        `<div class="cooked-weight-badge"><i class="fas fa-scale-balanced"></i> Cooks to ${m.cookedWeight}g</div>` :
        '';
    return `
        <div class="saved-meal-card" onclick="openEditMealModal(${i})">
            <button class="saved-meal-delete-btn" onclick="event.stopPropagation(); quickDeleteMeal(${i})" title="Delete meal"><i class="fas fa-trash-alt"></i></button>
            ${picHtml}
            <div class="name"><span class="meal-icon">${icon}</span> ${m.name}</div>
            <div class="items">${m.items.length} items</div>
            <div class="kcal">${Math.round(totalKcal)} kcal</div>
            ${cookedWeightHtml}
            ${instrHtml}
        </div>
    `;
}

// Deletes a meal straight from its card on the Saved Meals tab (the trash
// icon — see renderMealCard()) without opening the Edit Meal popup first.
// event.stopPropagation() on that button (in the onclick above) is what
// stops this from also triggering the card's own onclick and opening the
// edit popup right after the meal's already gone.
function quickDeleteMeal(idx) {
    const meal = savedMeals[idx];
    if (!meal) return;
    if (!confirm(`Delete "${meal.name}"?`)) return;
    savedMeals.splice(idx, 1);
    localStorage.setItem('savedMeals', JSON.stringify(savedMeals));
    renderSavedMeals();
}

// The "All / [group] / Ungrouped" pill row above the Saved Meals grid.
function renderSavedMealsFilterPills() {
    const row = document.getElementById('savedMealsFilterRow');
    if (!row) return;
    let html = `<button class="meal-filter-pill ${savedMealsActiveFilter === 'all' ? 'active' : ''}" onclick="setSavedMealsFilter('all')">All</button>`;
    mealGroups.forEach(g => {
        html += `<button class="meal-filter-pill ${savedMealsActiveFilter === g.id ? 'active' : ''}" onclick="setSavedMealsFilter('${g.id}')">${g.icon || '🍽️'} ${g.name}</button>`;
    });
    html += `<button class="meal-filter-pill ${savedMealsActiveFilter === 'ungrouped' ? 'active' : ''}" onclick="setSavedMealsFilter('ungrouped')">Ungrouped</button>`;
    row.innerHTML = html;
}

function setSavedMealsFilter(filterId) {
    savedMealsActiveFilter = filterId;
    renderSavedMeals();
}

function openEditMealModal(idx) {
    editingMealIndex = idx;
    const meal = savedMeals[idx];
    if (!meal) return;
    document.getElementById('mealModalTitle').innerText = 'Edit Meal';
    document.getElementById('mealNameInput').value = meal.name;
    selectedMealIcon = meal.icon || '🍽️';
    document.getElementById('selectedIconDisplay').textContent = selectedMealIcon;
    tempMealItems = meal.items.map(i => ({ ...i }));
    renderIconPicker();
    renderMealItems();
    populateMealGroupSelect();
    document.getElementById('mealGroupSelect').value = meal.groupId || '';
    document.getElementById('mealCookedWeightInput').value = meal.cookedWeight || '';
    document.getElementById('mealInstructionsInput').value = meal.instructions || '';
    if (meal.pictureDataURL) {
        document.getElementById('mealPictureInput').value = '';
        document.getElementById('mealPictureFile').value = '';
        mealPictureDataURL = meal.pictureDataURL;
        updateMealPicturePreview();
    } else {
        document.getElementById('mealPictureInput').value = meal.pictureUrl || '';
        mealPictureDataURL = null;
        updateMealPicturePreview();
    }
    document.getElementById('deleteMealBtn').style.display = 'inline-block';
    document.getElementById('saveMealModal').classList.add('show');
}

function openSaveMealFromCurrentLog() {
    editingMealIndex = null;
    document.getElementById('mealModalTitle').innerText = 'Save Meal';
    document.getElementById('mealNameInput').value = '';
    selectedMealIcon = '🍽️';
    document.getElementById('selectedIconDisplay').textContent = '🍽️';
    tempMealItems = [];
    renderIconPicker();
    renderMealItems();
    populateMealGroupSelect();
    document.getElementById('mealGroupSelect').value = '';
    document.getElementById('mealCookedWeightInput').value = '';
    document.getElementById('mealInstructionsInput').value = '';
    document.getElementById('mealPictureInput').value = '';
    document.getElementById('mealPictureFile').value = '';
    mealPictureDataURL = null;
    document.getElementById('mealPicturePreview').classList.remove('show');
    document.getElementById('deleteMealBtn').style.display = 'none';
    document.getElementById('saveMealModal').classList.add('show');
}

function closeSaveMealModal() {
    document.getElementById('saveMealModal').classList.remove('show');
}

function renderIconPicker() {
    const grid = document.getElementById('iconPickerGrid');
    grid.innerHTML = MEAL_ICONS.map(icon =>
        `<button class="${icon === selectedMealIcon ? 'selected' : ''}" onclick="selectMealIcon('${icon}')">${icon}</button>`
    ).join('');
}

function selectMealIcon(icon) {
    selectedMealIcon = icon;
    document.getElementById('selectedIconDisplay').textContent = icon;
    renderIconPicker();
}

function renderMealItems() {
    const list = document.getElementById('mealItemsList');
    if (tempMealItems.length === 0) {
        list.innerHTML =
            '<div style="color:var(--text-muted); font-style:italic; font-size:0.9rem;">No items yet</div>';
        return;
    }
    list.innerHTML = tempMealItems.map((item, idx) =>
        `<div class="meal-detail-item">
            <span>${item.name} (${item.amount||''}${item.unit||''}) - ${Math.round(item.kcal)} kcal</span>
            <span style="display:flex; gap:2px;">
                <button onclick="editMealItemAmount(${idx})" title="Change amount" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; transition:0.15s;"><i class="fas fa-pen"></i></button>
                <button onclick="removeMealItem(${idx})" title="Remove" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; transition:0.15s;"><i class="fas fa-times"></i></button>
            </span>
        </div>`
    ).join('');
}

function removeMealItem(idx) {
    tempMealItems.splice(idx, 1);
    renderMealItems();
}

// Lets you change an already-added ingredient's amount while building/
// editing a meal, instead of having to remove it and add it back with the
// new amount. Re-looks-up the ingredient by name (same pattern as the
// Dashboard's own editFoodItem()) to recompute its macros at the new
// amount — same unit as before, since changing units isn't asked for here.
function editMealItemAmount(idx) {
    const item = tempMealItems[idx];
    if (!item) return;
    const newAmountStr = prompt(`Enter new amount for ${item.name} (${item.unit || 'g'}):`, item.amount);
    if (newAmountStr === null) return;
    const amount = parseFloat(newAmountStr);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    const ing = INGREDIENTS.find(i => i.name === item.name);
    if (!ing) {
        alert("Can't find this ingredient anymore to recalculate its macros — remove it and add it again instead.");
        return;
    }
    const macros = parseAmount(ing, amount, item.unit || 'g');
    tempMealItems[idx] = { name: item.name, ...macros, amount, unit: item.unit || 'g' };
    renderMealItems();
}

function handleMealPictureFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        mealPictureDataURL = e.target.result;
        document.getElementById('mealPictureInput').value = '';
        updateMealPicturePreview();
    };
    reader.readAsDataURL(file);
}

function updateMealPicturePreview() {
    const urlInput = document.getElementById('mealPictureInput').value.trim();
    const preview = document.getElementById('mealPicturePreview');
    const img = document.getElementById('mealPicturePreviewImg');
    let src = mealPictureDataURL || urlInput;
    if (src && src.length > 0) {
        img.src = src;
        preview.classList.add('show');
        img.onerror = function() {
            preview.classList.remove('show');
        };
        img.onload = function() {
            preview.classList.add('show');
        };
    } else {
        preview.classList.remove('show');
    }
}

function confirmSaveMeal() {
    const name = document.getElementById('mealNameInput').value.trim();
    if (!name) {
        alert('Please enter a meal name.');
        return;
    }
    if (tempMealItems.length === 0) {
        alert('Please add at least one item to the meal.');
        return;
    }

    const instructions = document.getElementById('mealInstructionsInput').value.trim();
    let pictureDataURL = mealPictureDataURL || '';
    let pictureUrl = document.getElementById('mealPictureInput').value.trim();
    if (pictureDataURL) pictureUrl = '';

    // Optional — see the "Total cooked weight" field above. A blank/0/
    // invalid value is stored as null, which is exactly what
    // loadSavedMealFromModal() (dashboard.js) checks to decide whether
    // tapping this meal should ask for a portion or just log it whole,
    // same as always.
    const cookedWeightRaw = parseFloat(document.getElementById('mealCookedWeightInput').value);
    const cookedWeight = (isFinite(cookedWeightRaw) && cookedWeightRaw > 0) ? cookedWeightRaw : null;

    // Which group (Breakfast, Snack, Dinner, Dessert...) this meal belongs
    // to, or null for "no group" — this is also how a meal gets MOVED from
    // one group to another: reopen it from its card, change this dropdown,
    // and save. See populateMealGroupSelect() and openMealGroupsModal().
    const groupId = document.getElementById('mealGroupSelect').value || null;

    const mealData = {
        name,
        icon: selectedMealIcon,
        items: tempMealItems.map(i => ({ ...i })),
        cookedWeight,
        groupId,
        instructions: instructions || '',
        pictureDataURL: pictureDataURL,
        pictureUrl: pictureUrl
    };

    if (editingMealIndex !== null) {
        savedMeals[editingMealIndex] = mealData;
    } else {
        savedMeals.push(mealData);
    }
    localStorage.setItem('savedMeals', JSON.stringify(savedMeals));
    renderSavedMeals();
    closeSaveMealModal();
    alert('Meal saved!');
}

function deleteMeal() {
    if (editingMealIndex === null) return;
    if (!confirm(`Delete "${savedMeals[editingMealIndex].name}"?`)) return;
    savedMeals.splice(editingMealIndex, 1);
    localStorage.setItem('savedMeals', JSON.stringify(savedMeals));
    renderSavedMeals();
    closeSaveMealModal();
}

// ============================================================
//  INGREDIENT SELECTION FOR MEALS
// ============================================================
function openIngredientSelectionModal() {
    selectedIngredientForMeal = null;
    document.getElementById('ingredientSelectionSearch').value = '';
    document.getElementById('ingredientSelectionAmount').value = 100;
    document.getElementById('ingredientSelectionUnit').value = 'g';
    renderIngredientSelectionList('');
    document.getElementById('ingredientSelectionModal').classList.add('show');
}

function closeIngredientSelectionModal() {
    document.getElementById('ingredientSelectionModal').classList.remove('show');
}

function filterIngredientSelection() {
    const search = document.getElementById('ingredientSelectionSearch').value;
    renderIngredientSelectionList(search);
}

function renderIngredientSelectionList(search) {
    const container = document.getElementById('ingredientSelectionList');
    const filtered = INGREDIENTS.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase())
    );
    if (filtered.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted); padding:16px; text-align:center; font-style:italic;">No ingredients found</div>';
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
            html +=
                `<div style="display:flex; align-items:center; gap:7px; font-size:0.6rem; text-transform:uppercase; font-weight:700; color:var(--text-muted); padding:5px 8px; background:var(--bg-input); border-radius:8px; margin:4px 0;">${categoryIconHtml(cat)} ${cat.name}</div>`;
            grouped[cat.name].forEach(i => {
                const isSelected = selectedIngredientForMeal && selectedIngredientForMeal.name === i
                    .name;
                html += `<div class="ingredient-selection-item ${isSelected ? 'selected' : ''}" onclick="selectIngredientForMeal('${i.name}')">
                    <span class="is-name">${i.name}</span>
                    <span class="is-kcal">${i.kcal} kcal / ${i.unit || '100g'}</span>
                </div>`;
            });
        }
    }
    container.innerHTML = html;

    if (selectedIngredientForMeal) {
        const items = container.querySelectorAll('.ingredient-selection-item');
        items.forEach(el => {
            if (el.textContent.includes(selectedIngredientForMeal.name)) {
                el.classList.add('selected');
            }
        });
    }
}

function selectIngredientForMeal(name) {
    const ing = INGREDIENTS.find(i => i.name === name);
    if (!ing) return;
    selectedIngredientForMeal = ing;
    document.getElementById('ingredientSelectionAmount').value = 100;
    document.getElementById('ingredientSelectionUnit').value = ing.unit || 'g';
    renderIngredientSelectionList(document.getElementById('ingredientSelectionSearch').value);
}

function addSelectedIngredientToMeal() {
    if (!selectedIngredientForMeal) {
        alert('Please select an ingredient from the list.');
        return;
    }
    const amount = parseFloat(document.getElementById('ingredientSelectionAmount').value) || 0;
    if (amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    const unit = document.getElementById('ingredientSelectionUnit').value;
    const macros = parseAmount(selectedIngredientForMeal, amount, unit);
    tempMealItems.push({
        name: selectedIngredientForMeal.name,
        ...macros,
        amount,
        unit
    });
    closeIngredientSelectionModal();
    renderMealItems();
}

document.getElementById('ingredientSelectionModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeIngredientSelectionModal();
});

// ============================================================
//  MEAL GROUPS — categories for saved meals (Breakfast, Snack,
//  Dinner, Dessert...). Each group is { id, name, icon }; each saved
//  meal optionally carries a matching groupId (see confirmSaveMeal()
//  above). A meal whose groupId doesn't match any current group (or
//  has none) shows up under "Ungrouped" everywhere it's listed.
// ============================================================
function saveMealGroupsToStorage() {
    localStorage.setItem('mealGroups', JSON.stringify(mealGroups));
}

// Fills the Group dropdown in the Save/Edit Meal popup. Called every time
// that popup opens (openEditMealModal/openSaveMealFromCurrentLog) and any
// time the group list itself changes (confirmSaveMealGroup/deleteMealGroup),
// so it never goes stale while that popup happens to be open.
function populateMealGroupSelect() {
    const select = document.getElementById('mealGroupSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">No group</option>' +
        mealGroups.map(g => `<option value="${g.id}">${g.icon || '🍽️'} ${g.name}</option>`).join('');
    // Re-apply whatever was selected before repopulating, if it still
    // exists — keeps a group choice from silently resetting to "No group"
    // if this is called while the popup is already open (e.g. right after
    // creating a new group from inside it).
    if (mealGroups.some(g => g.id === current)) select.value = current;
}

function openMealGroupsModal() {
    renderMealGroupsManageList();
    document.getElementById('mealGroupsModal').classList.add('show');
}

function closeMealGroupsModal() {
    document.getElementById('mealGroupsModal').classList.remove('show');
}

function renderMealGroupsManageList() {
    const container = document.getElementById('mealGroupsManageList');
    if (mealGroups.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-style:italic; padding:10px 0;">No groups yet — create one below (e.g. Breakfast, Snack, Dinner, Dessert).</div>';
        return;
    }
    container.innerHTML = mealGroups.map(g => {
        const count = savedMeals.filter(m => m.groupId === g.id).length;
        return `<div class="meal-group-manage-row">
            <span style="display:flex; align-items:center; gap:8px;"><span style="font-size:1.2rem;">${g.icon || '🍽️'}</span> ${g.name} <span style="font-size:0.7rem; color:var(--text-muted);">(${count})</span></span>
            <button onclick="openEditMealGroupModal('${g.id}')" style="background:none; border:none; cursor:pointer; color:var(--text-muted); padding:4px 8px; border-radius:8px; transition:0.15s;"><i class="fas fa-edit"></i></button>
        </div>`;
    }).join('');
}

// null groupId means "creating a new group"; otherwise editing that
// existing group. Closes the Manage Groups list underneath it (rather than
// stacking two popups on screen) — closeEditMealGroupModal() reopens that
// list afterward, whether the user Saves, Deletes, or Cancels.
function openEditMealGroupModal(groupId) {
    editingGroupId = groupId;
    const group = groupId ? mealGroups.find(g => g.id === groupId) : null;
    document.getElementById('mealGroupModalTitle').innerText = group ? 'Edit Group' : 'New Group';
    document.getElementById('groupNameInput').value = group ? group.name : '';
    selectedGroupIcon = group ? (group.icon || '🍽️') : '🍽️';
    document.getElementById('selectedGroupIconDisplay').textContent = selectedGroupIcon;
    renderGroupIconPicker();
    document.getElementById('deleteGroupBtn').style.display = group ? 'inline-block' : 'none';
    closeMealGroupsModal();
    document.getElementById('editMealGroupModal').classList.add('show');
}

function closeEditMealGroupModal() {
    document.getElementById('editMealGroupModal').classList.remove('show');
    openMealGroupsModal();
}

function renderGroupIconPicker() {
    const grid = document.getElementById('groupIconPickerGrid');
    grid.innerHTML = MEAL_ICONS.map(icon =>
        `<button class="${icon === selectedGroupIcon ? 'selected' : ''}" onclick="selectGroupIcon('${icon}')">${icon}</button>`
    ).join('');
}

function selectGroupIcon(icon) {
    selectedGroupIcon = icon;
    document.getElementById('selectedGroupIconDisplay').textContent = icon;
    renderGroupIconPicker();
}

function confirmSaveMealGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name) {
        alert('Please enter a group name.');
        return;
    }
    if (editingGroupId) {
        const group = mealGroups.find(g => g.id === editingGroupId);
        if (group) {
            group.name = name;
            group.icon = selectedGroupIcon;
        }
    } else {
        mealGroups.push({ id: 'grp_' + Date.now(), name, icon: selectedGroupIcon });
    }
    saveMealGroupsToStorage();
    populateMealGroupSelect();
    renderSavedMeals();
    closeEditMealGroupModal();
}

// Deleting a group never deletes the meals in it — they're just reassigned
// to "no group" (Ungrouped), same idea as deleting an ingredient category
// elsewhere in this app.
function deleteMealGroup() {
    if (!editingGroupId) return;
    const group = mealGroups.find(g => g.id === editingGroupId);
    if (!group) return;
    const affected = savedMeals.filter(m => m.groupId === editingGroupId).length;
    const warning = affected > 0
        ? `Delete "${group.name}"? ${affected} meal(s) in this group will become ungrouped (they won't be deleted).`
        : `Delete "${group.name}"?`;
    if (!confirm(warning)) return;

    savedMeals.forEach(m => { if (m.groupId === editingGroupId) m.groupId = null; });
    localStorage.setItem('savedMeals', JSON.stringify(savedMeals));
    mealGroups = mealGroups.filter(g => g.id !== editingGroupId);
    saveMealGroupsToStorage();

    if (savedMealsActiveFilter === editingGroupId) savedMealsActiveFilter = 'all';
    populateMealGroupSelect();
    renderSavedMeals();
    closeEditMealGroupModal();
}