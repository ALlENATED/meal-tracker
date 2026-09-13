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
    const grid = document.getElementById('savedMealGrid');
    document.getElementById('savedCount').innerText = savedMeals.length;
    if (savedMeals.length === 0) {
        grid.innerHTML =
            '<div style="color:var(--text-muted); font-style:italic; padding:16px 0;">No saved meals yet. Create one from the Dashboard!</div>';
        return;
    }
    grid.innerHTML = savedMeals.map((m, idx) => {
        const totalKcal = m.items.reduce((s, i) => s + i.kcal, 0);
        const icon = m.icon || '🍽️';
        const hasPic = m.pictureDataURL && m.pictureDataURL.length > 0;
        const picHtml = hasPic ?
            `<div class="meal-pic"><img src="${m.pictureDataURL}" alt="${m.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'no-pic\\'>no image</div>'"></div>` :
            `<div class="meal-pic"><div class="no-pic">📷 no image</div></div>`;
        const instrHtml = m.instructions && m.instructions.trim().length > 0 ?
            `<div class="instructions">${m.instructions}</div>` :
            '';
        return `
            <div class="saved-meal-card" onclick="openEditMealModal(${idx})">
                ${picHtml}
                <div class="name"><span class="meal-icon">${icon}</span> ${m.name}</div>
                <div class="items">${m.items.length} items</div>
                <div class="kcal">${Math.round(totalKcal)} kcal</div>
                ${instrHtml}
            </div>
        `;
    }).join('');
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
    if (dailyLog.length === 0) {
        alert('No foods to save. Add some food first!');
        return;
    }
    editingMealIndex = null;
    document.getElementById('mealModalTitle').innerText = 'Save Meal';
    document.getElementById('mealNameInput').value = '';
    selectedMealIcon = '🍽️';
    document.getElementById('selectedIconDisplay').textContent = '🍽️';
    tempMealItems = [];
    renderIconPicker();
    renderMealItems();
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
            <button onclick="removeMealItem(${idx})" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; transition:0.15s;"><i class="fas fa-times"></i></button>
        </div>`
    ).join('');
}

function removeMealItem(idx) {
    tempMealItems.splice(idx, 1);
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

    const mealData = {
        name,
        icon: selectedMealIcon,
        items: tempMealItems.map(i => ({ ...i })),
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
            const icon = cat.icon || '📁';
            html +=
                `<div style="font-size:0.6rem; text-transform:uppercase; font-weight:700; color:var(--text-muted); padding:6px 8px; background:var(--bg-input); border-radius:8px; margin:4px 0;">${icon} ${cat.name}</div>`;
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