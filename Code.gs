/**
 * Gestionnaire de Tâches - Google Apps Script
 * Version 13
 */

// === Configuration ===
var CONFIG = {
  SHEET_NAME: 'Taches',
  COLUMNS: {
    ID: 0,
    TITRE: 1,
    STATUT: 2,
    DATE: 3,
    CATEGORIE: 4,
    DATEFAIT: 5
  },
  STATUS: {
    TODO: 'À faire',
    DONE: 'Terminé'
  }
};

/**
 * Point d'entrée - Sert l'interface HTML
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gestionnaire de Tâches')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Récupère la feuille de calcul des tâches
 * Crée la feuille et les en-têtes si nécessaire
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Créer la feuille si elle n'existe pas
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['ID', 'Titre', 'Statut', 'Date', 'Catégorie', 'DateFait']);
    sheet.setFrozenRows(1);
    
    // Formater l'en-tête
    var headerRange = sheet.getRange(1, 1, 1, 6);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4361ee');
    headerRange.setFontColor('white');
  }
  
  return sheet;
}

/**
 * Récupère toutes les tâches
 * @returns {Array<Object>} Liste des tâches
 */
function getTaches() {
  try {
    var sheet = getSheet();
    var data = sheet.getDataRange().getValues();
    
    // Pas de données (juste l'en-tête ou feuille vide)
    if (data.length <= 1) {
      return [];
    }
    
    // Supprimer l'en-tête
    data.shift();
    
    // Mapper les données en objets
    return data.map(function(row) {
      return {
        id: sanitizeString(row[CONFIG.COLUMNS.ID]),
        titre: sanitizeString(row[CONFIG.COLUMNS.TITRE]),
        statut: sanitizeString(row[CONFIG.COLUMNS.STATUT]) || CONFIG.STATUS.TODO,
        date: sanitizeString(row[CONFIG.COLUMNS.DATE]),
        categorie: sanitizeString(row[CONFIG.COLUMNS.CATEGORIE]) || 'Divers',
        dateFait: sanitizeString(row[CONFIG.COLUMNS.DATEFAIT])
      };
    }).filter(function(task) {
      // Filtrer les lignes vides
      return task.id && task.titre;
    });
    
  } catch (error) {
    console.error('Erreur getTaches:', error);
    throw new Error('Impossible de charger les tâches');
  }
}

/**
 * Ajoute une nouvelle tâche
 * @param {string} id - Identifiant unique
 * @param {string} titre - Titre de la tâche
 * @param {string} categorie - Catégorie
 * @param {string} date - Date de création
 * @returns {boolean} Succès
 */
function ajouterTache(id, titre, categorie, date) {
  try {
    // Validation des entrées
    if (!id || !titre) {
      throw new Error('ID et titre requis');
    }
    
    var sheet = getSheet();
    
    // Vérifier que l'ID n'existe pas déjà
    if (findRowById(sheet, id) !== -1) {
      throw new Error('Une tâche avec cet ID existe déjà');
    }
    
    sheet.appendRow([
      sanitizeString(id),
      sanitizeString(titre),
      CONFIG.STATUS.TODO,
      sanitizeString(date),
      sanitizeString(categorie) || 'Divers',
      ''
    ]);
    
    return true;
    
  } catch (error) {
    console.error('Erreur ajouterTache:', error);
    throw new Error('Impossible d\'ajouter la tâche: ' + error.message);
  }
}

/**
 * Modifie une tâche existante
 * @param {string} id - Identifiant de la tâche
 * @param {string} nouveauTitre - Nouveau titre
 * @param {string} nouvelleCategorie - Nouvelle catégorie
 * @returns {boolean} Succès
 */
function modifierTache(id, nouveauTitre, nouvelleCategorie) {
  try {
    if (!id || !nouveauTitre) {
      throw new Error('ID et titre requis');
    }
    
    var sheet = getSheet();
    var rowIndex = findRowById(sheet, id);
    
    if (rowIndex === -1) {
      throw new Error('Tâche non trouvée');
    }
    
    // Mettre à jour le titre (colonne B = 2) et la catégorie (colonne E = 5)
    sheet.getRange(rowIndex, 2).setValue(sanitizeString(nouveauTitre));
    sheet.getRange(rowIndex, 5).setValue(sanitizeString(nouvelleCategorie) || 'Divers');
    
    return true;
    
  } catch (error) {
    console.error('Erreur modifierTache:', error);
    throw new Error('Impossible de modifier la tâche: ' + error.message);
  }
}

/**
 * Bascule le statut d'une tâche (À faire <-> Terminé)
 * @param {string} id - Identifiant de la tâche
 * @returns {boolean} Succès
 */
function basculerStatut(id) {
  try {
    if (!id) {
      throw new Error('ID requis');
    }
    
    var sheet = getSheet();
    var rowIndex = findRowById(sheet, id);
    
    if (rowIndex === -1) {
      throw new Error('Tâche non trouvée');
    }
    
    var currentStatus = sheet.getRange(rowIndex, 3).getValue();
    var newStatus = (currentStatus === CONFIG.STATUS.TODO) 
      ? CONFIG.STATUS.DONE 
      : CONFIG.STATUS.TODO;
    
    sheet.getRange(rowIndex, 3).setValue(newStatus);
    
    // Écrire la date de completion ou l'effacer
    var now = new Date();
    var dateFait = (newStatus === CONFIG.STATUS.DONE)
      ? now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + 
        ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
      : '';
    sheet.getRange(rowIndex, 6).setValue(dateFait);
    
    return { dateFait: dateFait };
    
  } catch (error) {
    console.error('Erreur basculerStatut:', error);
    throw new Error('Impossible de changer le statut: ' + error.message);
  }
}

/**
 * Supprime une tâche
 * @param {string} id - Identifiant de la tâche
 * @returns {boolean} Succès
 */
function supprimerTache(id) {
  try {
    if (!id) {
      throw new Error('ID requis');
    }
    
    var sheet = getSheet();
    var rowIndex = findRowById(sheet, id);
    
    if (rowIndex === -1) {
      throw new Error('Tâche non trouvée');
    }
    
    sheet.deleteRow(rowIndex);
    
    return true;
    
  } catch (error) {
    console.error('Erreur supprimerTache:', error);
    throw new Error('Impossible de supprimer la tâche: ' + error.message);
  }
}

// === Fonctions utilitaires ===

/**
 * Trouve l'index de ligne d'une tâche par son ID
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - La feuille
 * @param {string} id - L'ID recherché
 * @returns {number} Index de ligne (1-based) ou -1 si non trouvé
 */
function findRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  var searchId = String(id);
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][CONFIG.COLUMNS.ID]) === searchId) {
      return i + 1; // Index 1-based pour les opérations sur la feuille
    }
  }
  
  return -1;
}

/**
 * Nettoie et valide une chaîne de caractères
 * @param {*} value - Valeur à nettoyer
 * @returns {string} Chaîne nettoyée
 */
function sanitizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}