/** A11Y-8Z3 (B10): ConfirmDialog texts from 8X4–8X6 in components that had
 * them hardcoded in Swedish. Title, description (the question) and confirm
 * button follow the app language; Avbryt comes from common:actions.cancel. */
export const confirmSv = {
  archiveDelete: { confirm: 'Ta bort permanent', description: 'Vill du ta bort det arkiverade objektet permanent?', title: 'Ta bort arkiverat objekt' },
  coachHistory: { confirm: 'Rensa', description: 'Vill du rensa all coachhistorik?', title: 'Rensa coachhistorik' },
  coachMemory: { confirm: 'Glöm', description: 'Vill du glömma alla härledda coachminnen? Preferenser behålls.', title: 'Glöm härledda coachminnen' },
  dietaryClear: { confirm: 'Rensa', description: 'Vill du ta bort dina sparade matpreferenser?', title: 'Rensa matpreferenser' },
  planner: {
    clearShopping: { confirm: 'Rensa', description: 'Vill du rensa vald veckas inköpslista?', title: 'Rensa inköpslista' },
    clearWeek: { confirm: 'Rensa', description: 'Vill du rensa vald veckoplan?', title: 'Rensa veckoplan' },
    copyReplace: { confirm: 'Ersätt', description: 'Vill du ersätta befintliga måltider på måldagarna?', title: 'Ersätt måltider' },
    removeMeal: { confirm: 'Ta bort', description: 'Vill du ta bort den planerade måltiden?', title: 'Ta bort planerad måltid' },
    removeRegistered: { confirm: 'Ta bort från planen', description: 'Måltiden registrerades. Vill du ta bort den från planen?', title: 'Måltiden registrerades' },
  },
  progressPhoto: { confirm: 'Ta bort', description: 'Vill du ta bort den här framstegsbilden?', title: 'Ta bort framstegsbild' },
  recipeDelete: { confirm: 'Ta bort', description: 'Vill du ta bort receptet?', title: 'Ta bort recept' },
  templateDelete: { confirm: 'Radera', description: 'Vill du ta bort mallen "{{name}}"?', title: 'Radera mall' },
}

export const confirmEn = {
  archiveDelete: { confirm: 'Delete permanently', description: 'Do you want to permanently delete the archived item?', title: 'Delete archived item' },
  coachHistory: { confirm: 'Clear', description: 'Do you want to clear all coach history?', title: 'Clear coach history' },
  coachMemory: { confirm: 'Forget', description: 'Do you want to forget all derived coach memories? Preferences are kept.', title: 'Forget derived coach memories' },
  dietaryClear: { confirm: 'Clear', description: 'Do you want to remove your saved food preferences?', title: 'Clear food preferences' },
  planner: {
    clearShopping: { confirm: 'Clear', description: 'Do you want to clear the shopping list for the selected week?', title: 'Clear shopping list' },
    clearWeek: { confirm: 'Clear', description: 'Do you want to clear the selected week plan?', title: 'Clear week plan' },
    copyReplace: { confirm: 'Replace', description: 'Do you want to replace existing meals on the target days?', title: 'Replace meals' },
    removeMeal: { confirm: 'Remove', description: 'Do you want to remove the planned meal?', title: 'Remove planned meal' },
    removeRegistered: { confirm: 'Remove from plan', description: 'The meal was logged. Do you want to remove it from the plan?', title: 'The meal was logged' },
  },
  progressPhoto: { confirm: 'Delete', description: 'Do you want to delete this progress photo?', title: 'Delete progress photo' },
  recipeDelete: { confirm: 'Delete', description: 'Do you want to delete the recipe?', title: 'Delete recipe' },
  templateDelete: { confirm: 'Delete', description: 'Do you want to delete the template "{{name}}"?', title: 'Delete template' },
}
