/**
 * GOLDEN CAISSE - Logique Applicative & Interface Utilisateur
 */

// État de la session utilisateur
let currentUser = null;
let currentView = 'caisse-principale';
let flowChartInstance = null;
let ratioChartInstance = null;

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
  
  // S'abonner aux changements de la base de données (pour la synchronisation multi-onglets)
  db.subscribe((data) => {
    updateUI(data);
    showSyncFlash();
  });
});

// Étape d'initialisation de l'application
function initApp() {
  const data = db.get();
  
  // Mettre à jour les informations de l'hôtel dans l'en-tête
  document.getElementById('header-hotel-name').textContent = data.companyInfo.name;

  // Mettre à jour le statut cloud
  updateCloudStatusIndicator();

  // Restaurer une session active si elle existe (simulation session persistante)
  const savedUser = sessionStorage.getItem('logged_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showMainApp();
  } else {
    // Par défaut, afficher l'écran d'accueil (Landing Screen)
    showScreen('landing-screen');
  }
}

// Configurer les écouteurs d'événements globaux
function setupEventListeners() {
  // Configurer le formatage automatique des montants avec séparateur de milliers
  document.querySelectorAll('.formatted-amount').forEach(input => {
    input.addEventListener('input', (e) => {
      formatAmountInput(e.target);
    });
  });
}

// Formatage d'un champ montant à la saisie (ex: "1250000" -> "1 250 000")
function formatAmountInput(inputEl) {
  let val = inputEl.value.replace(/\D/g, ''); // Retirer tout ce qui n'est pas un chiffre
  if (val === '') {
    inputEl.value = '';
    return;
  }
  // Formater avec des espaces tous les 3 chiffres
  inputEl.value = new Intl.NumberFormat('fr-FR').format(parseInt(val, 10));
}

// Convertir une chaîne formatée en nombre (ex: "1 250 000" -> 1250000)
function parseFormattedAmount(valString) {
  if (!valString) return 0;
  return parseInt(valString.replace(/\s/g, '').replace(/[^0-9]/g, ''), 10) || 0;
}

// Formater un montant pour affichage standard dans l'UI (ex: 5000000 -> "5 000 000 FCFA")
function formatCurrency(amount, currency = 'FCFA') {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
}

// Navigation entre les écrans principaux (Landing, Setup, Login, Main App)
function showScreen(screenId) {
  const screens = ['landing-screen', 'setup-wizard-screen', 'login-screen', 'main-app'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === screenId ? 'flex' : 'none';
  });
  
  if (screenId === 'main-app') {
    // Adapter la vue par défaut en fonction du rôle
    if (currentUser.role === 'raf') {
      switchView('raf-dashboard');
    } else {
      switchView('caisse-principale');
    }
  }
}

// Afficher le setup wizard
function showSetupWizard() {
  showScreen('setup-wizard-screen');
}

// Afficher le login
function showLoginScreen() {
  showScreen('login-screen');
}

// Soumission de la configuration initiale (setup)
function handleSetupSubmit() {
  const hotelName = document.getElementById('setup-hotel-name').value;
  const currency = document.getElementById('setup-hotel-currency').value;
  const phone = document.getElementById('setup-hotel-phone').value;
  const email = document.getElementById('setup-hotel-email').value;

  const adminName = document.getElementById('setup-admin-name').value;
  const adminUsername = document.getElementById('setup-admin-username').value;
  const adminPassword = document.getElementById('setup-admin-password').value;

  // Enregistrer les infos de l'hôtel
  db.updateCompanyInfo({
    name: hotelName,
    currency: currency,
    phone: phone,
    email: email
  });

  // Ajouter l'administrateur RAF dans les comptes utilisateurs
  const data = db.get();
  // Vérifier si le RAF existe déjà dans la base pour éviter les doublons
  let adminUser = data.users.find(u => u.username === adminUsername);
  if (!adminUser) {
    adminUser = db.addUser({
      name: adminName,
      username: adminUsername,
      password: adminPassword,
      role: 'raf'
    });
  }

  alert("Configuration de l'établissement et création du compte RAF réussies !");
  showLoginScreen();
}

// Soumission de la connexion
function handleLoginSubmit() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  const data = db.get();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (user) {
    currentUser = user;
    sessionStorage.setItem('logged_user', JSON.stringify(user));
    errorEl.style.display = 'none';
    
    // Vider les champs
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';

    showMainApp();
  } else {
    errorEl.style.display = 'block';
  }
}

// Afficher l'application principale après connexion
function showMainApp() {
  showScreen('main-app');
  
  // Configurer la barre latérale selon le rôle
  const navCaissiere = document.getElementById('nav-caissiere');
  const navRaf = document.getElementById('nav-raf');
  const profileName = document.getElementById('profile-name');
  const profileRole = document.getElementById('profile-role');
  const userAvatar = document.getElementById('user-avatar');

  profileName.textContent = currentUser.name;
  profileRole.textContent = currentUser.role === 'raf' ? 'RAF - Administrateur' : 'Caissière';
  userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();

  if (currentUser.role === 'raf') {
    navRaf.style.display = 'flex';
    navCaissiere.style.display = 'none';
  } else {
    navCaissiere.style.display = 'flex';
    navRaf.style.display = 'none';
  }

  // Mettre à jour l'UI avec les données
  updateUI(db.get());
}

// Déconnexion
function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('logged_user');
  showScreen('landing-screen');
}

// Basculer de vue (Caisse principale, Caisse exploitation, Tableau de bord, etc.)
function switchView(viewId) {
  currentView = viewId;
  
  // Masquer toutes les vues
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });

  // Afficher la vue ciblée
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.style.display = 'block';
    targetView.classList.add('active');
  }

  // Mettre à jour le bouton actif de la sidebar
  document.querySelectorAll('.menu-item').forEach(el => {
    el.classList.remove('active');
    if (el.getAttribute('data-view') === viewId) {
      el.classList.add('active');
    }
  });

  // Mettre à jour le titre et le sous-titre de la topbar
  updateHeaderTitle(viewId);

  // Rafraîchir les données de la vue
  updateUI(db.get());
}

// Mettre à jour les titres de l'en-tête de la page
function updateHeaderTitle(viewId) {
  const viewTitle = document.getElementById('view-title');
  const viewSubtitle = document.getElementById('view-subtitle');

  switch (viewId) {
    case 'caisse-principale':
      viewTitle.textContent = "Caisse Principale";
      viewSubtitle.textContent = "Ouverture, encaissements, décaissements et gestion des pièces justificatives.";
      break;
    case 'caisse-exploitation':
      viewTitle.textContent = "Caisse d'Exploitation";
      viewSubtitle.textContent = "Entrées points de vente (Restaurant, Réception, Bar, Piscine) et dépenses directes.";
      break;
    case 'transferts':
      viewTitle.textContent = "Transferts de fonds";
      viewSubtitle.textContent = "Mouvements financiers internes de caisse à caisse.";
      break;
    case 'regularisations':
      viewTitle.textContent = "Régularisations Acheteuse";
      viewSubtitle.textContent = "Rapprochement des décaissements et dépenses réelles de l'acheteuse.";
      break;
    case 'raf-dashboard':
      viewTitle.textContent = "Tableau de Bord RAF";
      viewSubtitle.textContent = "Indicateurs clés de performance et synthèse graphique des flux financiers.";
      break;
    case 'raf-validation':
      viewTitle.textContent = "Validation Régularisations";
      viewSubtitle.textContent = "Contrôle, visa et validation des états de dépenses de l'acheteuse.";
      break;
    case 'raf-historiques':
      viewTitle.textContent = "Historique Général des Opérations";
      viewSubtitle.textContent = "Visualisation et recherche multi-critères des journaux de caisse.";
      break;
    case 'raf-parametres':
      viewTitle.textContent = "Paramètres de la Caisse";
      viewSubtitle.textContent = "Configuration de l'hôtel, devises et gestion des accès agents.";
      break;
  }
}

// Flasher brièvement l'indicateur de synchronisation pour montrer le temps réel
function showSyncFlash() {
  const syncIndicator = document.getElementById('sync-indicator');
  const syncText = document.getElementById('sync-text');
  if (syncIndicator) {
    syncIndicator.classList.add('active');
    syncText.textContent = "Données synchronisées";
    setTimeout(() => {
      syncText.textContent = "En direct (Simultané)";
    }, 2000);
  }
}

// Mettre à jour l'ensemble de l'interface utilisateur en fonction des données BDD
function updateUI(data) {
  if (!currentUser) return;

  // Mettre à jour le statut cloud
  updateCloudStatusIndicator();

  // Mettre à jour la notification du RAF (badge du menu latéral)
  const pendingRegsCount = data.regularizations.filter(r => r.status === 'en_attente_validation').length;
  const badgeEl = document.getElementById('raf-pending-reg-badge');
  if (badgeEl) {
    if (pendingRegsCount > 0 && currentUser.role === 'raf') {
      badgeEl.textContent = pendingRegsCount;
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  const cp = data.caisses.principale;
  const ce = data.caisses.exploitation;
  const currency = data.companyInfo.currency;

  // ---------------- CAISSE PRINCIPALE VIEW RENDER ----------------
  if (document.getElementById('view-caisse-principale')) {
    // Statut & Solde
    const cpStatus = document.getElementById('cp-status-badge');
    cpStatus.textContent = cp.isOpen ? "Ouverte" : "Fermée";
    cpStatus.className = `caisse-badge ${cp.isOpen ? 'open' : 'closed'}`;
    
    document.getElementById('cp-opening-details').textContent = cp.isOpen 
      ? `Ouverte par ${cp.openedBy} le ${new Date(cp.openedAt).toLocaleDateString('fr-FR')} à ${new Date(cp.openedAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`
      : "Caisse fermée. Veuillez l'ouvrir pour enregistrer des opérations.";
    
    document.getElementById('cp-current-balance').textContent = formatCurrency(cp.currentBalance, currency);

    // Rendre les boutons Ouvrir/Fermer
    const cpActions = document.getElementById('cp-actions-container');
    if (cp.isOpen) {
      cpActions.innerHTML = `<button onclick="openCloseCaisseModal('principale')" class="btn btn-secondary"><i class="fa-solid fa-lock"></i> Fermeture & Billetage</button>`;
      document.getElementById('btn-cp-entry').removeAttribute('disabled');
      document.getElementById('btn-cp-exit').removeAttribute('disabled');
    } else {
      cpActions.innerHTML = `<button onclick="openOpenCaisseModal('principale')" class="btn btn-primary"><i class="fa-solid fa-lock-open"></i> Ouvrir la caisse</button>`;
      document.getElementById('btn-cp-entry').setAttribute('disabled', 'true');
      document.getElementById('btn-cp-exit').setAttribute('disabled', 'true');
    }

    // Statistiques du jour
    const cpDayTxs = data.transactions.filter(t => t.caisse === 'principale' && isToday(new Date(t.date)));
    const cpEntries = cpDayTxs.filter(t => t.type === 'entree').reduce((sum, t) => sum + t.montant, 0);
    const cpExits = cpDayTxs.filter(t => t.type === 'sortie').reduce((sum, t) => sum + t.montant, 0);
    document.getElementById('cp-day-entries').textContent = formatCurrency(cpEntries, currency);
    document.getElementById('cp-day-exits').textContent = formatCurrency(cpExits, currency);

    // Alerte pièces justificatives
    const cpUnjustified = data.transactions.filter(t => t.caisse === 'principale' && t.justificatifAttendu && !t.justifie);
    const alertBox = document.getElementById('cp-unjustified-alert');
    const countEl = document.getElementById('cp-unjustified-count');
    const itemsList = document.getElementById('cp-unjustified-items-list');

    if (cpUnjustified.length > 0) {
      alertBox.style.display = 'flex';
      countEl.textContent = cpUnjustified.length;
      itemsList.innerHTML = cpUnjustified.map(tx => `
        <div class="unjustified-item">
          <div class="unjustified-item-details">
            <div class="unjustified-item-title">${tx.pieceRecu} - ${tx.motif}</div>
            <div class="unjustified-item-sub">Bénéficiaire : ${tx.beneficiaire} | Le ${new Date(tx.date).toLocaleDateString('fr-FR')} à ${new Date(tx.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div class="unjustified-item-amount">${formatCurrency(tx.montant, currency)}</div>
            <button onclick="handleJustifyTransaction('${tx.id}')" class="btn btn-primary btn-sm"><i class="fa-solid fa-file-signature"></i> Justifier</button>
          </div>
        </div>
      `).join('');
    } else {
      alertBox.style.display = 'none';
    }

    // Rendre les transactions du jour
    renderTransactionsTable('principale', data);
  }

  // ---------------- CAISSE EXPLOITATION VIEW RENDER ----------------
  if (document.getElementById('view-caisse-exploitation')) {
    // Statut & Solde
    const ceStatus = document.getElementById('ce-status-badge');
    ceStatus.textContent = ce.isOpen ? "Ouverte" : "Fermée";
    ceStatus.className = `caisse-badge ${ce.isOpen ? 'open' : 'closed'}`;
    
    document.getElementById('ce-opening-details').textContent = ce.isOpen 
      ? `Ouverte par ${ce.openedBy} le ${new Date(ce.openedAt).toLocaleDateString('fr-FR')} à ${new Date(ce.openedAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`
      : "Caisse fermée. Veuillez l'ouvrir pour enregistrer des opérations.";
    
    document.getElementById('ce-current-balance').textContent = formatCurrency(ce.currentBalance, currency);

    // Rendre les boutons Ouvrir/Fermer
    const ceActions = document.getElementById('ce-actions-container');
    if (ce.isOpen) {
      ceActions.innerHTML = `<button onclick="openCloseCaisseModal('exploitation')" class="btn btn-secondary"><i class="fa-solid fa-lock"></i> Fermeture & Billetage</button>`;
      document.getElementById('btn-ce-entry').removeAttribute('disabled');
      document.getElementById('btn-ce-exit').removeAttribute('disabled');
    } else {
      ceActions.innerHTML = `<button onclick="openOpenCaisseModal('exploitation')" class="btn btn-primary"><i class="fa-solid fa-lock-open"></i> Ouvrir la caisse</button>`;
      document.getElementById('btn-ce-entry').setAttribute('disabled', 'true');
      document.getElementById('btn-ce-exit').setAttribute('disabled', 'true');
    }

    // Statistiques du jour
    const ceDayTxs = data.transactions.filter(t => t.caisse === 'exploitation' && isToday(new Date(t.date)));
    const ceEntries = ceDayTxs.filter(t => t.type === 'entree').reduce((sum, t) => sum + t.montant, 0);
    const ceExits = ceDayTxs.filter(t => t.type === 'sortie').reduce((sum, t) => sum + t.montant, 0);
    document.getElementById('ce-day-entries').textContent = formatCurrency(ceEntries, currency);
    document.getElementById('ce-day-exits').textContent = formatCurrency(ceExits, currency);

    // Rendre les transactions du jour
    renderTransactionsTable('exploitation', data);
  }

  // ---------------- TRANSFERTS VIEW RENDER ----------------
  if (currentView === 'transferts') {
    adjustTransferDestinations();
    renderTransferHistory(data);
  }

  // ---------------- REGULARISATIONS VIEW RENDER ----------------
  if (currentView === 'regularisations') {
    if (regPendingOps.length === 0) {
      loadAcheteusePendingOps();
    }
    renderRegularizationHistory(data);
  }

  // ---------------- RAF DASHBOARD VIEW RENDER ----------------
  if (currentView === 'raf-dashboard') {
    // KPIs
    document.getElementById('kpi-cp-balance').textContent = formatCurrency(cp.currentBalance, currency);
    document.getElementById('kpi-ce-balance').textContent = formatCurrency(ce.currentBalance, currency);
    
    const unjustifiedCount = data.transactions.filter(t => t.justificatifAttendu && !t.justifie).length;
    document.getElementById('kpi-unjustified-count').textContent = unjustifiedCount;

    const pendingRegCount = data.regularizations.filter(r => r.status === 'en_attente_validation').length;
    document.getElementById('kpi-pending-reg-count').textContent = pendingRegCount;

    // Render Charts
    renderCharts(data);
  }

  // ---------------- RAF VALIDATION RENDER ----------------
  if (currentView === 'raf-validation') {
    renderRafValidationTable(data);
  }

  // ---------------- RAF HISTORIQUES RENDER ----------------
  if (currentView === 'raf-historiques') {
    renderRafHistoryTable('principale', data);
    renderRafHistoryTable('exploitation', data);
  }

  // ---------------- RAF PARAMETRES RENDER ----------------
  if (currentView === 'raf-parametres') {
    document.getElementById('settings-hotel-name').value = data.companyInfo.name;
    document.getElementById('settings-hotel-currency').value = data.companyInfo.currency;
    document.getElementById('settings-hotel-phone').value = data.companyInfo.phone;
    document.getElementById('settings-hotel-email').value = data.companyInfo.email;
    
    // Charger la config Firebase existante
    const configStr = localStorage.getItem('firebase_config');
    document.getElementById('settings-firebase-config').value = configStr ? JSON.stringify(JSON.parse(configStr), null, 2) : '';
    
    renderSettingsUsersList(data);
  }
}

// Vérifier si une date correspond à aujourd'hui
function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

// ---------------- FONCTIONS DE TABLEAU DES TRANSACTIONS (CAISSIÈRE) ----------------
function renderTransactionsTable(caisseName, data) {
  const tableBody = document.querySelector(`#table-${caisseName === 'principale' ? 'cp' : 'ce'}-transactions tbody`);
  if (!tableBody) return;

  const searchQuery = document.getElementById(`${caisseName === 'principale' ? 'cp' : 'ce'}-search`).value.toLowerCase();
  
  // Filtrer les transactions du jour pour cette caisse
  let txs = data.transactions.filter(t => t.caisse === caisseName && isToday(new Date(t.date)));

  // Filtre de recherche multicritère
  if (searchQuery) {
    txs = txs.filter(t => 
      t.pieceRecu.toLowerCase().includes(searchQuery) ||
      t.motif.toLowerCase().includes(searchQuery) ||
      t.beneficiaire.toLowerCase().includes(searchQuery) ||
      t.montant.toString().includes(searchQuery)
    );
  }

  // Trier par date décroissante
  txs.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (txs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${caisseName === 'principale' ? 8 : 7}" class="text-center" style="color: var(--text-secondary);">Aucune opération enregistrée pour aujourd'hui.</td></tr>`;
    return;
  }

  tableBody.innerHTML = txs.map(tx => {
    const isUnjustified = tx.justificatifAttendu && !tx.justifie;
    const rowClass = isUnjustified ? 'row-unjustified' : '';
    
    // Statut justificatif (seulement pour la caisse principale)
    let justifCell = '';
    if (caisseName === 'principale') {
      if (tx.justificatifAttendu) {
        justifCell = tx.justifie 
          ? `<td><span class="badge-status justified"><i class="fa-solid fa-circle-check"></i> Justifié</span></td>`
          : `<td><span class="badge-status unjustified"><i class="fa-solid fa-clock"></i> En attente</span></td>`;
      } else {
        justifCell = `<td><span style="color: var(--text-secondary); font-size: 0.8rem;">Non requis</span></td>`;
      }
    }

    return `
      <tr class="${rowClass}">
        <td class="font-bold">${tx.pieceRecu}</td>
        <td>${new Date(tx.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
        <td>${tx.motif}</td>
        <td>${tx.beneficiaire}</td>
        <td><span class="badge-type ${tx.type === 'entree' ? 'in' : 'out'}">${tx.type === 'entree' ? 'Entrée' : 'Sortie'}</span></td>
        <td class="text-right font-bold ${tx.type === 'entree' ? 'text-success' : 'text-danger'}">${formatCurrency(tx.montant, data.companyInfo.currency)}</td>
        ${justifCell}
        <td class="text-center">
          <button onclick="printSingleVoucher('${tx.id}')" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem;"><i class="fa-solid fa-print"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filtrer dynamiquement à la saisie dans la barre de recherche
function filterTransactions(caisseName) {
  renderTransactionsTable(caisseName, db.get());
}

// ---------------- GESTION DES MODALS ET TRANSACTIONS ----------------
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Modal d'ouverture de caisse
function openOpenCaisseModal(caisseName) {
  document.getElementById('open-caisse-name').value = caisseName;
  document.getElementById('open-caisse-modal-title').textContent = `Ouverture de la Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'}`;
  document.getElementById('open-caisse-amount').value = '';
  openModal('modal-ouvrir-caisse');
}

function handleOpenCaisseSubmit() {
  const caisseName = document.getElementById('open-caisse-name').value;
  const amount = parseFormattedAmount(document.getElementById('open-caisse-amount').value);

  if (amount < 0) {
    alert("Le montant d'ouverture ne peut pas être négatif.");
    return;
  }

  db.openCaisse(caisseName, amount, currentUser.name);
  closeModal('modal-ouvrir-caisse');
  alert(`Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'} ouverte avec succès !`);
}

// Modal d'enregistrement des mouvements (Entrées/Sorties)
function openTransactionModal(caisseName, type) {
  document.getElementById('tx-caisse').value = caisseName;
  document.getElementById('tx-type').value = type;
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-beneficiaire').value = '';

  // Configurer le titre
  const titleEl = document.getElementById('tx-modal-title');
  titleEl.textContent = `${type === 'entree' ? 'Nouvelle Entrée' : 'Nouvelle Sortie'} - Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'}`;

  // Configurer le label du motif (Motif vs Nature)
  const motifLabel = document.getElementById('tx-motif-label');
  if (caisseName === 'principale' && type === 'sortie') {
    motifLabel.textContent = "Nature de l'opération";
  } else {
    motifLabel.textContent = "Motif de l'opération";
  }

  // Configurer les motifs
  const motifSelect = document.getElementById('tx-motif');
  motifSelect.innerHTML = '';
  
  const motifs = {
    principale: {
      entree: ["Approvisionnement du RAF", "Recettes des boutiques du HALL", "Autres"],
      sortie: ["Dépenses d'exploitation", "Règlement des fournisseurs", "Versement en banque", "Autres"]
    },
    exploitation: {
      entree: ["Réception", "Restaurant", "Bar HALL", "Piscine", "Autres"],
      sortie: ["Remise de fonds au DAF", "Paiement de commissions", "Autres"]
    }
  };

  const currentMotifs = motifs[caisseName][type];
  currentMotifs.forEach(motif => {
    const opt = document.createElement('option');
    opt.value = motif;
    opt.textContent = motif;
    motifSelect.appendChild(opt);
  });

  // Afficher / Masquer le type de bénéficiaire (seulement Sortie de Caisse Principale)
  const typeGroup = document.getElementById('tx-beneficiaire-type-group');
  if (caisseName === 'principale' && type === 'sortie') {
    typeGroup.style.display = 'flex';
    document.getElementById('tx-beneficiaire-type').value = 'Acheteuse';
  } else {
    typeGroup.style.display = 'none';
  }

  // Afficher / Masquer l'objet du décaissement (seulement Sortie de Caisse Principale)
  const objetGroup = document.getElementById('tx-objet-group');
  const objetInput = document.getElementById('tx-objet');
  if (caisseName === 'principale' && type === 'sortie') {
    objetGroup.style.display = 'flex';
    objetInput.setAttribute('required', 'true');
    objetInput.value = '';
  } else {
    objetGroup.style.display = 'none';
    objetInput.removeAttribute('required');
    objetInput.value = '';
  }

  // Afficher / Masquer la case justificatif (Seulement pour les Sorties de la caisse principale)
  const justifGroup = document.getElementById('tx-justificatif-group');
  if (caisseName === 'principale' && type === 'sortie') {
    justifGroup.style.display = 'flex';
    document.getElementById('tx-justificatif-attendu').checked = false;
  } else {
    justifGroup.style.display = 'none';
  }

  adjustBeneficiaryField();
  openModal('modal-transaction');
}

// Ajuster dynamiquement les champs bénéficiaires selon le type
function adjustBeneficiaryField() {
  const caisseName = document.getElementById('tx-caisse').value;
  const type = document.getElementById('tx-type').value;
  const wrap = document.getElementById('tx-beneficiaire-wrap');
  const label = document.getElementById('tx-beneficiaire-label');

  if (caisseName === 'principale' && type === 'sortie') {
    const typeBenef = document.getElementById('tx-beneficiaire-type').value;
    if (typeBenef === 'Acheteuse') {
      label.innerHTML = "Bénéficiaire (Acheteuse)";
      wrap.innerHTML = `
        <select id="tx-beneficiaire" class="input-control" required>
          <option value="Mme Bamba">Mme Bamba (Acheteuse exploitation)</option>
        </select>
      `;
    } else if (typeBenef === 'Banques') {
      label.innerHTML = "Banque destinataire";
      wrap.innerHTML = `<input type="text" id="tx-beneficiaire" class="input-control" placeholder="Entrez le nom de la banque (ex: SGCI)" required>`;
    } else if (typeBenef === 'Fournisseurs') {
      label.innerHTML = "Nom du Fournisseur";
      wrap.innerHTML = `<input type="text" id="tx-beneficiaire" class="input-control" placeholder="Entrez le nom du fournisseur" required>`;
    } else {
      label.innerHTML = "Bénéficiaire / Motif externe";
      wrap.innerHTML = `<input type="text" id="tx-beneficiaire" class="input-control" placeholder="Entrez le nom du bénéficiaire" required>`;
    }
  } else {
    label.innerHTML = "Bénéficiaire / Provenance";
    wrap.innerHTML = `<input type="text" id="tx-beneficiaire" class="input-control" placeholder="Entrez le nom" required>`;
  }
}

// Soumission d'une nouvelle transaction
function handleTransactionSubmit() {
  const caisseName = document.getElementById('tx-caisse').value;
  const type = document.getElementById('tx-type').value;
  const motif = document.getElementById('tx-motif').value;
  const beneficiaire = document.getElementById('tx-beneficiaire').value;
  const amount = parseFormattedAmount(document.getElementById('tx-amount').value);
  const justifAttendu = document.getElementById('tx-justificatif-attendu').checked;

  if (amount <= 0) {
    alert("Le montant doit être supérieur à zéro.");
    return;
  }

  // Si c'est une sortie, vérifier la provision
  const dbData = db.get();
  const currentBal = dbData.caisses[caisseName].currentBalance;
  if (type === 'sortie' && amount > currentBal) {
    alert(`Provision insuffisante ! Le solde actuel de la caisse est de ${formatCurrency(currentBal, dbData.companyInfo.currency)}.`);
    return;
  }

  let benefType = null;
  let objet = null;
  if (caisseName === 'principale' && type === 'sortie') {
    benefType = document.getElementById('tx-beneficiaire-type').value;
    objet = document.getElementById('tx-objet').value.trim();
  }

  const tx = {
    caisse: caisseName,
    type: type,
    motif: motif,
    objetDecaissement: objet,
    beneficiaire: beneficiaire,
    beneficiaireType: benefType,
    montant: amount,
    justificatifAttendu: caisseName === 'principale' && type === 'sortie' ? justifAttendu : false,
    justifie: !justifAttendu, // Si justificatif attendu plus tard, alors non justifié pour l'instant
    created_by: currentUser.name
  };

  const createdTx = db.addTransaction(tx);
  closeModal('modal-transaction');
  
  // Demander confirmation d'impression du bon
  if (confirm(`Opération enregistrée sous le n° ${createdTx.pieceRecu}. Souhaitez-vous imprimer le bon de caisse ?`)) {
    printSingleVoucher(createdTx.id);
  }
}

// Action de justification par la caissière depuis l'alerte
function handleJustifyTransaction(txId) {
  db.justifyTransaction(txId);
  alert("La pièce comptable a été justifiée avec succès et marquée comme telle.");
}

// ---------------- FERMETURE DE CAISSE & BILLETAGE ----------------
function openCloseCaisseModal(caisseName) {
  document.getElementById('close-caisse-name').value = caisseName;
  document.getElementById('close-caisse-modal-title').textContent = `Fermeture de la Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'}`;
  
  const data = db.get();
  const currentBal = data.caisses[caisseName].currentBalance;
  document.getElementById('close-caisse-theoretical').textContent = formatCurrency(currentBal, data.companyInfo.currency);
  
  // Vider les champs du billetage
  const billets = ['10000', '5000', '2000', '1000', '500', '200', '100', '50', '10'];
  billets.forEach(b => {
    document.getElementById(`billet-${b}`).value = '0';
    document.getElementById(`total-${b}`).textContent = `0 ${data.companyInfo.currency}`;
  });

  calculateBilletageTotal();
  openModal('modal-fermer-caisse');
}

// Calculer en direct la somme physique et l'écart
function calculateBilletageTotal() {
  const data = db.get();
  const currency = data.companyInfo.currency;
  
  const b10000 = parseInt(document.getElementById('billet-10000').value, 10) || 0;
  const b5000 = parseInt(document.getElementById('billet-5000').value, 10) || 0;
  const b2000 = parseInt(document.getElementById('billet-2000').value, 10) || 0;
  const b1000 = parseInt(document.getElementById('billet-1000').value, 10) || 0;
  const b500 = parseInt(document.getElementById('billet-500').value, 10) || 0;
  const b200 = parseInt(document.getElementById('billet-200').value, 10) || 0;
  const b100 = parseInt(document.getElementById('billet-100').value, 10) || 0;
  const b50 = parseInt(document.getElementById('billet-50').value, 10) || 0;
  const b10 = parseInt(document.getElementById('billet-10').value, 10) || 0;

  // Calculer les sous-totaux
  const t10000 = b10000 * 10000;
  const t5000 = b5000 * 5000;
  const t2000 = b2000 * 2000;
  const t1000 = b1000 * 1000;
  const t500 = b500 * 500;
  const t200 = b200 * 200;
  const t100 = b100 * 100;
  const t50 = b50 * 50;
  const t10 = b10 * 10;

  document.getElementById('total-10000').textContent = formatCurrency(t10000, currency);
  document.getElementById('total-5000').textContent = formatCurrency(t5000, currency);
  document.getElementById('total-2000').textContent = formatCurrency(t2000, currency);
  document.getElementById('total-1000').textContent = formatCurrency(t1000, currency);
  document.getElementById('total-500').textContent = formatCurrency(t500, currency);
  document.getElementById('total-200').textContent = formatCurrency(t200, currency);
  document.getElementById('total-100').textContent = formatCurrency(t100, currency);
  document.getElementById('total-50').textContent = formatCurrency(t50, currency);
  document.getElementById('total-10').textContent = formatCurrency(t10, currency);

  const totalPhysique = t10000 + t5000 + t2000 + t1000 + t500 + t200 + t100 + t50 + t10;
  document.getElementById('billetage-total-physique').textContent = formatCurrency(totalPhysique, currency);

  // Ecart
  const caisseName = document.getElementById('close-caisse-name').value;
  const theoretical = data.caisses[caisseName].currentBalance;
  const variance = totalPhysique - theoretical;

  const varianceEl = document.getElementById('billetage-variance');
  const msgEl = document.getElementById('billetage-variance-message');

  varianceEl.textContent = formatCurrency(variance, currency);

  if (variance === 0) {
    varianceEl.className = 'reg-value font-bold text-success';
    msgEl.textContent = "Aucun écart détecté. Caisse parfaitement équilibrée.";
    msgEl.style.color = 'var(--success)';
  } else if (variance > 0) {
    varianceEl.className = 'reg-value font-bold text-success';
    msgEl.textContent = `Excédent constaté de caisse de +${formatCurrency(variance, currency)}.`;
    msgEl.style.color = 'var(--success)';
  } else {
    varianceEl.className = 'reg-value font-bold text-danger';
    msgEl.textContent = `Manquant de caisse de ${formatCurrency(variance, currency)}.`;
    msgEl.style.color = 'var(--danger)';
  }
}

// Validation de la fermeture de caisse
function handleCloseCaisseSubmit() {
  const caisseName = document.getElementById('close-caisse-name').value;
  
  const billetage = {
    '10000': parseInt(document.getElementById('billet-10000').value, 10) || 0,
    '5000': parseInt(document.getElementById('billet-5000').value, 10) || 0,
    '2000': parseInt(document.getElementById('billet-2000').value, 10) || 0,
    '1000': parseInt(document.getElementById('billet-1000').value, 10) || 0,
    '500': parseInt(document.getElementById('billet-500').value, 10) || 0,
    '200': parseInt(document.getElementById('billet-200').value, 10) || 0,
    '100': parseInt(document.getElementById('billet-100').value, 10) || 0,
    '50': parseInt(document.getElementById('billet-50').value, 10) || 0,
    '10': parseInt(document.getElementById('billet-10').value, 10) || 0
  };

  db.closeCaisse(caisseName, billetage, currentUser.name);
  closeModal('modal-fermer-caisse');
  
  alert(`Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'} fermée avec succès !`);
  
  // Imprimer le rapport de clôture
  if (confirm("Souhaitez-vous imprimer le rapport de fermeture de caisse ?")) {
    printCaisseDayReport(caisseName);
  }
}

// ---------------- TRANSFERS ENGINE ----------------
function adjustTransferDestinations() {
  const from = document.getElementById('transfer-from').value;
  const toSelect = document.getElementById('transfer-to');
  const maxHint = document.getElementById('transfer-max-hint');
  const data = db.get();

  const balance = data.caisses[from].currentBalance;
  maxHint.textContent = `Solde disponible dans la caisse émettrice : ${formatCurrency(balance, data.companyInfo.currency)}`;

  if (from === 'principale') {
    toSelect.value = 'exploitation';
  } else {
    toSelect.value = 'principale';
  }
}

function handleTransferSubmit() {
  const from = document.getElementById('transfer-from').value;
  const to = document.getElementById('transfer-to').value;
  const amount = parseFormattedAmount(document.getElementById('transfer-amount').value);
  const data = db.get();

  if (amount <= 0) {
    alert("Le montant doit être supérieur à zéro.");
    return;
  }

  const balance = data.caisses[from].currentBalance;
  if (amount > balance) {
    alert("Solde insuffisant pour ce transfert.");
    return;
  }

  db.transferFunds(from, to, amount, currentUser.name);
  document.getElementById('transfer-amount').value = '';
  alert("Le transfert de fonds a été effectué avec succès !");
}

function renderTransferHistory(data) {
  const tableBody = document.querySelector('#table-transfer-history tbody');
  if (!tableBody) return;

  // Filtrer les transactions qui correspondent à des transferts
  const transfers = data.transactions.filter(t => t.motif.startsWith('Transfert de fonds'));
  // Trier
  transfers.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (transfers.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: var(--text-secondary);">Aucun transfert effectué.</td></tr>`;
    return;
  }

  // Grouper par paire d'opérations (puisque chaque transfert génère une entrée et une sortie)
  // On va plutôt juste afficher les sorties de transfert pour simplifier l'historique
  const uniqueTransfers = transfers.filter(t => t.type === 'sortie');

  tableBody.innerHTML = uniqueTransfers.map(t => {
    const isToPrincipale = t.motif.includes('vers Caisse Principale');
    return `
      <tr>
        <td class="font-bold">${t.pieceRecu}</td>
        <td>${new Date(t.date).toLocaleDateString('fr-FR')}</td>
        <td>Caisse ${t.caisse === 'principale' ? 'Principale' : 'd\'Exploitation'}</td>
        <td>Caisse ${isToPrincipale ? 'Principale' : 'd\'Exploitation'}</td>
        <td class="text-right font-bold text-gold">${formatCurrency(t.montant, data.companyInfo.currency)}</td>
      </tr>
    `;
  }).join('');
}

// ---------------- WEEKLY REGULARIZATION ENGINE ----------------
let currentRegAcheteuse = 'Mme Bamba';
let regPendingOps = []; // Contiendra les opérations en attente de régul : { txId, date, pieceRecu, motif, montant, montantReel, ecart }
let regSortOrder = 'asc'; // Ordre de tri par date : 'asc' | 'desc'

function calculatePendingAcheteuseDecaissements(acheteuse, data) {
  return data.transactions.filter(tx => 
    tx.caisse === 'principale' &&
    tx.type === 'sortie' &&
    tx.motif === 'Dépenses d\'exploitation' &&
    tx.beneficiaire.includes(acheteuse) &&
    !tx.regularizationId
  ).reduce((sum, tx) => sum + tx.montant, 0);
}

// Charger les opérations en attente pour l'acheteuse sélectionnée
function loadAcheteusePendingOps() {
  const acheteuse = document.getElementById('reg-acheteuse').value;
  currentRegAcheteuse = acheteuse;
  
  const data = db.get();
  // Filtrer les bons de sortie non régularisés
  let relatedTxs = data.transactions.filter(tx => 
    tx.caisse === 'principale' &&
    tx.type === 'sortie' &&
    tx.motif === 'Dépenses d\'exploitation' &&
    tx.beneficiaire.includes(acheteuse) &&
    !tx.regularizationId
  );

  // Appliquer le filtrage par date
  const dateStartVal = document.getElementById('reg-date-start').value;
  const dateEndVal = document.getElementById('reg-date-end').value;

  let startLimit = null;
  if (dateStartVal) {
    const parts = dateStartVal.split('-');
    startLimit = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
  }

  let endLimit = null;
  if (dateEndVal) {
    const parts = dateEndVal.split('-');
    endLimit = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999);
  }

  if (startLimit) {
    relatedTxs = relatedTxs.filter(tx => new Date(tx.date) >= startLimit);
  }
  if (endLimit) {
    relatedTxs = relatedTxs.filter(tx => new Date(tx.date) <= endLimit);
  }

  // Initialiser les objets de travail pour la régulation unitaire
  regPendingOps = relatedTxs.map(t => ({
    txId: t.id,
    date: t.date,
    pieceRecu: t.pieceRecu,
    motif: t.motif,
    montant: t.montant,
    montantReel: t.montant, // Par défaut le montant dépensé est égal au montant perçu
    ecart: 0
  }));

  // Appliquer le tri
  sortPendingOps();

  // Rendre le tableau
  renderRegPendingOpsTable();
}

// Trier les opérations de régularisation
function sortPendingOps() {
  regPendingOps.sort((a, b) => {
    const dA = new Date(a.date);
    const dB = new Date(b.date);
    return regSortOrder === 'asc' ? dA - dB : dB - dA;
  });
}

// Basculer l'ordre de tri par date
function toggleSortPendingOpsByDate() {
  regSortOrder = regSortOrder === 'asc' ? 'desc' : 'asc';
  const icon = document.getElementById('sort-icon-date');
  if (icon) {
    icon.className = regSortOrder === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }
  sortPendingOps();
  renderRegPendingOpsTable();
}

// Rendre la table des opérations à régulariser
function renderRegPendingOpsTable() {
  const tbody = document.querySelector('#table-reg-pending-ops tbody');
  if (!tbody) return;

  const data = db.get();
  const currency = data.companyInfo.currency;

  if (regPendingOps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--text-secondary); padding: 2rem;">Aucune dépense en attente de régularisation pour cette acheteuse.</td></tr>`;
    document.getElementById('reg-total-percu').textContent = formatCurrency(0, currency);
    document.getElementById('reg-total-reel').textContent = formatCurrency(0, currency);
    document.getElementById('reg-total-ecart').textContent = formatCurrency(0, currency);
    document.getElementById('btn-submit-reg-breakdown').setAttribute('disabled', 'true');
    return;
  }

  document.getElementById('btn-submit-reg-breakdown').removeAttribute('disabled');

  tbody.innerHTML = regPendingOps.map((op, index) => {
    return `
      <tr>
        <td>${new Date(op.date).toLocaleDateString('fr-FR')} à ${new Date(op.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
        <td class="font-bold">${op.pieceRecu}</td>
        <td>${op.motif}</td>
        <td class="text-right font-bold text-gold">${formatCurrency(op.montant, currency)}</td>
        <td>
          <div class="input-amount-wrapper">
            <input type="text" class="input-control btn-sm formatted-amount text-right" style="padding-right: 3rem;" value="${new Intl.NumberFormat('fr-FR').format(op.montantReel)}" oninput="updateRegOpRealAmount(${index}, this.value)">
            <span class="currency-symbol" style="font-size: 0.85rem; right: 0.8rem;">${currency}</span>
          </div>
        </td>
        <td class="text-right font-bold ${op.ecart >= 0 ? 'text-success' : 'text-danger'}" id="reg-op-ecart-${index}">
          ${op.ecart >= 0 ? '+' : ''}${formatCurrency(op.ecart, currency)}
        </td>
      </tr>
    `;
  }).join('');

  updateRegPendingOpsTotals();
}

// Mettre à jour le montant réel saisi pour une opération
function updateRegOpRealAmount(index, valStr) {
  const amount = parseFormattedAmount(valStr);
  const op = regPendingOps[index];
  op.montantReel = amount;
  op.ecart = op.montant - amount; // Écart = Perçu - Dépensé (si positif, l'acheteuse rend de l'argent)

  const ecartEl = document.getElementById(`reg-op-ecart-${index}`);
  const currency = db.get().companyInfo.currency;
  if (ecartEl) {
    ecartEl.textContent = (op.ecart >= 0 ? '+' : '') + formatCurrency(op.ecart, currency);
    ecartEl.className = `text-right font-bold ${op.ecart >= 0 ? 'text-success' : 'text-danger'}`;
  }

  updateRegPendingOpsTotals();
}

// Calculer les totaux de régularisation et mettre à jour l'état
function updateRegPendingOpsTotals() {
  const currency = db.get().companyInfo.currency;
  const totalPercu = regPendingOps.reduce((sum, o) => sum + o.montant, 0);
  const totalReel = regPendingOps.reduce((sum, o) => sum + o.montantReel, 0);
  const totalEcart = regPendingOps.reduce((sum, o) => sum + o.ecart, 0);

  document.getElementById('reg-total-percu').textContent = formatCurrency(totalPercu, currency);
  document.getElementById('reg-total-reel').textContent = formatCurrency(totalReel, currency);
  
  const ecartEl = document.getElementById('reg-total-ecart');
  ecartEl.textContent = (totalEcart >= 0 ? '+' : '') + formatCurrency(totalEcart, currency);
  ecartEl.className = `text-right font-bold ${totalEcart >= 0 ? 'text-success' : 'text-danger'}`;

  const msgEl = document.getElementById('reg-summary-message');
  if (totalEcart === 0) {
    msgEl.innerHTML = "Écart global équilibré. Aucun mouvement compensatoire après validation.";
  } else if (totalEcart > 0) {
    msgEl.innerHTML = `L'acheteuse devra restituer <strong class="text-success">${formatCurrency(totalEcart, currency)}</strong> (Retour en caisse) après visa RAF.`;
  } else {
    msgEl.innerHTML = `L'acheteuse percevra un complément de <strong class="text-danger">${formatCurrency(Math.abs(totalEcart), currency)}</strong> après visa RAF.`;
  }
}

// Soumettre l'état complet
function submitRegularizationBreakdown() {
  const acheteuse = document.getElementById('reg-acheteuse').value;
  if (regPendingOps.length === 0) return;

  const reg = db.createRegularization(acheteuse, regPendingOps, currentUser.name);
  
  alert("L'état de régularisation unitaire a été enregistré et transmis au RAF pour validation.");
  
  loadAcheteusePendingOps();
  renderRegularizationHistory(db.get());

  if (confirm("Souhaitez-vous imprimer l'état préparatoire de cette régularisation ?")) {
    printRegularizationState(reg.id, 'avant');
  }
}

// Imprimer l'état préparatoire (avant soumission)
function printPendingRegOps() {
  const acheteuse = document.getElementById('reg-acheteuse').value;
  if (regPendingOps.length === 0) {
    alert("Aucune opération à régulariser.");
    return;
  }

  const data = db.get();
  const currency = data.companyInfo.currency;
  const printArea = document.getElementById('print-container');

  const totalPercu = regPendingOps.reduce((sum, o) => sum + o.montant, 0);
  const totalReel = regPendingOps.reduce((sum, o) => sum + o.montantReel, 0);
  const totalEcart = regPendingOps.reduce((sum, o) => sum + o.ecart, 0);

  printArea.innerHTML = `
    <div class="print-header">
      <div class="print-hotel-details">
        <h2>${data.companyInfo.name}</h2>
        <p>État préparatoire de dépenses à régulariser</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Bénéficiaire (Acheteuse) :</strong> ${acheteuse}</p>
        <p><strong>Date d'émission :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
      </div>
    </div>

    <div class="print-voucher-title">
      <h1>ÉTAT DES OPÉRATIONS À RÉGULARISER</h1>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="border: 1px solid #ddd; padding: 8px;">Date & Heure</th>
          <th style="border: 1px solid #ddd; padding: 8px;">N° Pièce</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Motif</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Montant Perçu</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Montant Réel Dépensé</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Écart constaté</th>
        </tr>
      </thead>
      <tbody>
        ${regPendingOps.map(op => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${new Date(op.date).toLocaleDateString('fr-FR')} ${new Date(op.date).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${op.pieceRecu}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${op.motif}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(op.montant, currency)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(op.montantReel, currency)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: ${op.ecart >= 0 ? 'green' : 'red'};">
              ${op.ecart >= 0 ? '+' : ''}${formatCurrency(op.ecart, currency)}
            </td>
          </tr>
        `).join('')}
        <tr style="background: #f9fafb; font-weight: bold;">
          <td colspan="3" style="border: 1px solid #ddd; padding: 10px; text-align: right;">Totaux</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatCurrency(totalPercu, currency)}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatCurrency(totalReel, currency)}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${totalEcart >= 0 ? 'green' : 'red'};">
            ${totalEcart >= 0 ? '+' : ''}${formatCurrency(totalEcart, currency)}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="print-signatures" style="margin-top: 5rem;">
      <div class="print-signature-block">
        <div class="title">La Caissière</div>
        <div class="name"></div>
      </div>
      <div class="print-signature-block">
        <div class="title">L'Acheteuse</div>
        <div class="name">${acheteuse}</div>
      </div>
    </div>
  `;

  window.print();
}

function renderRegularizationHistory(data) {
  const tableBody = document.querySelector('#table-reg-history tbody');
  if (!tableBody) return;

  const regs = data.regularizations;
  regs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (regs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-secondary); padding: 1rem;">Aucune régularisation effectuée.</td></tr>`;
    return;
  }

  tableBody.innerHTML = regs.map(r => {
    let statusBadge = '';
    let actionBtn = '';

    if (r.status === 'en_attente_validation') {
      statusBadge = `<span class="badge-status unjustified"><i class="fa-solid fa-hourglass-half"></i> Visa RAF attendu</span>`;
      actionBtn = `<button onclick="printRegularizationState('${r.id}', 'avant')" class="btn btn-secondary btn-sm" title="Imprimer avant validation"><i class="fa-solid fa-print"></i> Avant</button>`;
    } else if (r.status === 'valide') {
      statusBadge = `<span class="badge-status justified" style="background: var(--info-glow); color: var(--info);"><i class="fa-solid fa-circle-check"></i> Validée (RAF)</span>`;
      actionBtn = `
        <button onclick="handleFinalizeReg('${r.id}')" class="btn btn-primary btn-sm"><i class="fa-solid fa-circle-check"></i> Finaliser</button>
        <button onclick="printRegularizationState('${r.id}', 'avant')" class="btn btn-secondary btn-sm" title="Imprimer avant"><i class="fa-solid fa-print"></i></button>
      `;
    } else {
      statusBadge = `<span class="badge-status justified"><i class="fa-solid fa-check-double"></i> Finalisée</span>`;
      actionBtn = `
        <button onclick="printRegularizationState('${r.id}', 'apres')" class="btn btn-secondary btn-sm" style="border-color: var(--gold); color: var(--gold);" title="Imprimer après finalisation"><i class="fa-solid fa-print"></i> Après</button>
      `;
    }

    const ecartText = r.ecart >= 0 
      ? `<span class="text-success font-bold">+${formatCurrency(r.ecart, data.companyInfo.currency)}</span>`
      : `<span class="text-danger font-bold">-${formatCurrency(Math.abs(r.ecart), data.companyInfo.currency)}</span>`;

    return `
      <tr>
        <td>${new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
        <td>${r.acheteuse}</td>
        <td class="text-right">${formatCurrency(r.decaissementsEffectues, data.companyInfo.currency)}</td>
        <td class="text-right">${formatCurrency(r.depensesReelles, data.companyInfo.currency)}</td>
        <td class="text-right font-bold">${ecartText}</td>
        <td>${statusBadge}</td>
        <td class="text-center" style="display: flex; gap: 0.25rem; justify-content: center;">
          ${actionBtn}
        </td>
      </tr>
    `;
  }).join('');
}

// Finaliser la régularisation par la caissière
function handleFinalizeReg(regId) {
  db.finalizeRegularization(regId, currentUser.name);
  alert("Régularisation finalisée ! Le mouvement financier d'écart a été automatiquement inséré dans la caisse principale.");
}

// ---------------- RAF VALIDATION INTERFACE ----------------
function renderRafValidationTable(data) {
  const tableBody = document.querySelector('#table-raf-pending-reg tbody');
  if (!tableBody) return;

  const pending = data.regularizations.filter(r => r.status === 'en_attente_validation');

  if (pending.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-secondary);">Aucune régularisation en attente de validation.</td></tr>`;
    return;
  }

  tableBody.innerHTML = pending.map(r => {
    const ecartText = r.ecart >= 0 
      ? `<span class="text-success font-bold">+${formatCurrency(r.ecart, data.companyInfo.currency)}</span>`
      : `<span class="text-danger font-bold">-${formatCurrency(Math.abs(r.ecart), data.companyInfo.currency)}</span>`;

    return `
      <tr>
        <td>${new Date(r.created_at).toLocaleDateString('fr-FR')} à ${new Date(r.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
        <td class="font-bold">${r.acheteuse}</td>
        <td class="text-right">${formatCurrency(r.decaissementsEffectues, data.companyInfo.currency)}</td>
        <td class="text-right">${formatCurrency(r.depensesReelles, data.companyInfo.currency)}</td>
        <td class="text-right">${ecartText}</td>
        <td class="text-center">
          <button onclick="printRegularizationState('${r.id}', 'avant')" class="btn btn-secondary btn-sm"><i class="fa-solid fa-print"></i> Imprimer État</button>
        </td>
        <td class="text-center">
          <button onclick="handleRafVisa('${r.id}')" class="btn btn-primary btn-sm"><i class="fa-solid fa-signature"></i> Accorder VISA RAF</button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleRafVisa(regId) {
  if (confirm("Confirmez-vous la validation et l'octroi du VISA pour cette régularisation ?")) {
    db.validateRegularization(regId, currentUser.name);
    alert("Visa accordé ! La caissière a maintenant la main pour finaliser l'opération.");
  }
}

// ---------------- RAF HISTORIQUE DIVISION GAUCHE/DROITE ----------------
function renderRafHistoryTable(caisseName, data) {
  const tableBody = document.querySelector(`#table-raf-${caisseName === 'principale' ? 'cp' : 'ce'}-history tbody`);
  if (!tableBody) return;

  const searchQuery = document.getElementById(`raf-${caisseName === 'principale' ? 'cp' : 'ce'}-search`).value.toLowerCase();
  
  let txs = data.transactions.filter(t => t.caisse === caisseName);

  if (searchQuery) {
    txs = txs.filter(t => 
      t.pieceRecu.toLowerCase().includes(searchQuery) ||
      t.motif.toLowerCase().includes(searchQuery) ||
      t.beneficiaire.toLowerCase().includes(searchQuery) ||
      t.montant.toString().includes(searchQuery) ||
      t.created_by.toLowerCase().includes(searchQuery)
    );
  }

  txs.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (txs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--text-secondary);">Aucune opération.</td></tr>`;
    return;
  }

  tableBody.innerHTML = txs.map(tx => {
    return `
      <tr>
        <td class="font-bold">${tx.pieceRecu}</td>
        <td style="font-size: 0.8rem;">${new Date(tx.date).toLocaleDateString('fr-FR')}</td>
        <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.motif}</td>
        <td>${tx.beneficiaire}</td>
        <td class="text-right font-bold ${tx.type === 'entree' ? 'text-success' : 'text-danger'}">${formatCurrency(tx.montant, data.companyInfo.currency)}</td>
        <td class="text-center">
          <button onclick="printSingleVoucher('${tx.id}')" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.4rem;"><i class="fa-solid fa-print"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterRafHistory(caisseName) {
  renderRafHistoryTable(caisseName, db.get());
}

// ---------------- PARAMÈTRES (RAF) ----------------
function handleHotelUpdateSubmit() {
  const name = document.getElementById('settings-hotel-name').value;
  const currency = document.getElementById('settings-hotel-currency').value;
  const phone = document.getElementById('settings-hotel-phone').value;
  const email = document.getElementById('settings-hotel-email').value;

  db.updateCompanyInfo({
    name: name,
    currency: currency,
    phone: phone,
    email: email
  });

  alert("Informations de l'hôtel enregistrées avec succès !");
}

function handleUserCreateSubmit() {
  const name = document.getElementById('new-user-name').value;
  const role = document.getElementById('new-user-role').value;
  const username = document.getElementById('new-user-username').value.trim();
  const password = document.getElementById('new-user-password').value;

  const data = db.get();
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    alert("Cet identifiant de connexion est déjà utilisé.");
    return;
  }

  db.addUser({
    name: name,
    role: role,
    username: username,
    password: password
  });

  // Vider les champs
  document.getElementById('new-user-name').value = '';
  document.getElementById('new-user-username').value = '';
  document.getElementById('new-user-password').value = '';

  alert(`L'agent ${name} a été enregistré avec le rôle ${role === 'raf' ? 'RAF' : 'Caissière'}.`);
}

function renderSettingsUsersList(data) {
  const listEl = document.getElementById('users-list-container');
  if (!listEl) return;

  listEl.innerHTML = `
    <h4 class="mt-4 mb-2" style="font-size: 1rem; color: var(--text-secondary);">Agents enregistrés (${data.users.length})</h4>
    ${data.users.map(u => `
      <div class="user-item">
        <div class="flex items-center gap-3">
          <div class="avatar" style="width: 32px; height: 32px; font-size: 0.85rem; border-color: ${u.role === 'raf' ? 'var(--info)' : 'var(--gold)'}; color: ${u.role === 'raf' ? 'var(--info)' : 'var(--gold)'};">${u.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">${u.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">${u.role === 'raf' ? 'RAF' : 'Caissière'} (@${u.username})</div>
          </div>
        </div>
        <div style="font-size: 0.8rem; font-style: italic; color: var(--text-secondary);">Mot de passe : ${u.password}</div>
      </div>
    `).join('')}
  `;
}

// ---------------- CHART.JS VISUALIZATIONS ----------------
function renderCharts(data) {
  const ctxFlow = document.getElementById('flowChart');
  const ctxRatio = document.getElementById('ratioChart');
  if (!ctxFlow || !ctxRatio) return;

  const cpBal = data.caisses.principale.currentBalance;
  const ceBal = data.caisses.exploitation.currentBalance;

  // Détruire les instances existantes pour éviter le clignotement ou la superposition
  if (flowChartInstance) flowChartInstance.destroy();
  if (ratioChartInstance) ratioChartInstance.destroy();

  // 1. Ratio Chart (Doughnut)
  ratioChartInstance = new Chart(ctxRatio, {
    type: 'doughnut',
    data: {
      labels: ['Caisse Principale', 'Caisse Exploitation'],
      datasets: [{
        data: [cpBal, ceBal],
        backgroundColor: ['#D4AF37', '#3B82F6'],
        borderColor: '#131A30',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94A3B8', font: { family: 'Inter' } }
        }
      }
    }
  });

  // 2. Flow Chart (Entrées vs Sorties sur les 5 dernières transactions)
  // Pour la démo, on extrait les 5 dernières transactions
  const lastTxs = [...data.transactions].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-5);
  const labels = lastTxs.map(t => t.pieceRecu);
  const entriesData = lastTxs.map(t => t.type === 'entree' ? t.montant : 0);
  const exitsData = lastTxs.map(t => t.type === 'sortie' ? t.montant : 0);

  flowChartInstance = new Chart(ctxFlow, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Aucune transaction'],
      datasets: [
        {
          label: 'Entrées (Recettes)',
          data: entriesData.length ? entriesData : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderRadius: 6
        },
        {
          label: 'Sorties (Décaissements)',
          data: exitsData.length ? exitsData : [0],
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
        y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94A3B8', font: { family: 'Inter' } }
        }
      }
    }
  });
}

// ---------------- PRINT TEMPLATE GENERATOR ----------------
// Convertir un nombre en texte (lettres) pour le respect du formalisme des bons
function convertNumberToFrenchWords(amount) {
  // Version très simplifiée pour les besoins de démonstration de la maquette
  if (amount === 0) return "zéro";
  
  const units = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
  const teens = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingt", "quatre-vingt-dix"];
  
  if (amount < 10) return units[amount];
  if (amount >= 10 && amount < 20) return teens[amount - 10];
  if (amount >= 20 && amount < 100) {
    const ten = Math.floor(amount / 10);
    const unit = amount % 10;
    return tens[ten] + (unit > 0 ? "-" + units[unit] : "");
  }
  
  // Fallback simple pour les montants plus élevés en situation réelle
  return amount.toLocaleString('fr-FR') + " de";
}

// Imprimer un bon d'entrée ou de sortie unique
function printSingleVoucher(txId) {
  const data = db.get();
  const tx = data.transactions.find(t => t.id === txId);
  if (!tx) return;

  const printArea = document.getElementById('print-container');
  
  const cleanAmountWords = convertNumberToFrenchWords(tx.montant);

  printArea.innerHTML = `
    <div class="print-voucher-wrapper">
      <div class="print-header">
        <div class="print-hotel-details">
          <h2>${data.companyInfo.name}</h2>
          <p>${data.companyInfo.address}</p>
          <p>Tél : ${data.companyInfo.phone} | Email : ${data.companyInfo.email}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 0.95rem; color: #666; font-family: var(--font-title); font-weight: bold; text-transform: uppercase;">Ticket de Caisse</p>
          <p style="margin-top: 0.25rem;"><strong>Caisse :</strong> Caisse ${tx.caisse === 'principale' ? 'Principale' : 'd\'Exploitation'}</p>
        </div>
      </div>

      <div class="print-voucher-title type-${tx.type}">
        <h1>BON ${tx.type === 'entree' ? 'D\'ENTRÉE' : 'DE SORTIE'} DE CAISSE</h1>
      </div>

      <div class="print-details-grid">
        <div class="print-detail-item"><strong>N° de Pièce :</strong> ${tx.pieceRecu}</div>
        <div class="print-detail-item"><strong>Date d'émission :</strong> ${new Date(tx.date).toLocaleDateString('fr-FR')} à ${new Date(tx.date).toLocaleTimeString('fr-FR')}</div>
        <div class="print-detail-item"><strong>${tx.type === 'entree' ? 'Reçu de :' : 'Payé à :'}</strong> ${tx.beneficiaire}</div>
        <div class="print-detail-item"><strong>${tx.caisse === 'principale' && tx.type === 'sortie' ? 'Nature de l\'opération' : 'Motif de l\'opération'} :</strong> ${tx.motif}</div>
        ${tx.objetDecaissement ? `<div class="print-detail-item" style="grid-column: span 2;"><strong style="width: 180px;">Objet du décaissement :</strong> ${tx.objetDecaissement}</div>` : ''}
      </div>

      <div class="print-amount-box">
        <div class="label">Montant de l'opération</div>
        <div class="value">${formatCurrency(tx.montant, data.companyInfo.currency)}</div>
        <p style="margin-top: 0.85rem; font-style: italic; font-size: 0.95rem; color: #333;">
          Arrêté le présent bon à la somme de : <strong>${cleanAmountWords} ${data.companyInfo.currency}</strong>
        </p>
      </div>

      <!-- Seuls signataires sur le bon : la caissière et le bénéficiaire (pas de RAF ni DAF) -->
      <div class="print-signatures">
        <div class="print-signature-block">
          <div class="title">La Caissière</div>
          <div class="name">${tx.created_by}</div>
        </div>
        <div class="print-signature-block">
          <div class="title">Le Bénéficiaire / Remettant</div>
          <div class="name">${tx.beneficiaire}</div>
        </div>
      </div>
    </div>
  `;

  window.print();
}

// Imprimer le rapport journalier de fermeture d'une caisse
function printCaisseDayReport(caisseName) {
  const data = db.get();
  const caisse = data.caisses[caisseName];
  const currency = data.companyInfo.currency;
  
  // Filtrer les opérations du jour pour cette caisse
  const dayTxs = data.transactions.filter(t => t.caisse === caisseName && isToday(new Date(t.date)));
  const entries = dayTxs.filter(t => t.type === 'entree');
  const exits = dayTxs.filter(t => t.type === 'sortie');

  const totalEntries = entries.reduce((sum, t) => sum + t.montant, 0);
  const totalExits = exits.reduce((sum, t) => sum + t.montant, 0);

  const printArea = document.getElementById('print-container');
  
  // Affichage du billetage
  let billetageHtml = '';
  if (caisse.billetage) {
    billetageHtml = `
      <h3 style="margin-top: 2rem; border-bottom: 2px solid #000; padding-bottom: 0.5rem; font-size: 1.15rem;">Billetage physique de clôture</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Coupure</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Quantité</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(caisse.billetage).map(([val, qty]) => {
            if (qty === 0) return '';
            return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${val} ${currency}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${qty}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(qty * parseInt(val, 10), currency)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  printArea.innerHTML = `
    <div class="print-header">
      <div class="print-hotel-details">
        <h2>${data.companyInfo.name}</h2>
        <p>Rapport d'activité journalier</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Caisse :</strong> Caisse ${caisseName === 'principale' ? 'Principale' : 'd\'Exploitation'}</p>
        <p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
      </div>
    </div>

    <div class="print-voucher-title" style="margin: 1.5rem 0;">
      <h1 style="font-size: 1.6rem; border-width: 2px;">RAPPORT DE FERMETURE DE CAISSE</h1>
    </div>

    <div class="print-details-grid" style="margin-bottom: 2rem;">
      <div class="print-detail-item"><strong>Encaisse d'ouverture :</strong> ${formatCurrency(caisse.initialBalance, currency)}</div>
      <div class="print-detail-item"><strong>Encaisse théorique finale :</strong> ${formatCurrency(caisse.currentBalance, currency)}</div>
      <div class="print-detail-item"><strong>Total Entrées Jour :</strong> ${formatCurrency(totalEntries, currency)}</div>
      <div class="print-detail-item"><strong>Total Sorties Jour :</strong> ${formatCurrency(totalExits, currency)}</div>
    </div>

    <h3 style="border-bottom: 2px solid #000; padding-bottom: 0.5rem; font-size: 1.15rem;">Détail des transactions du jour</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="border: 1px solid #ddd; padding: 6px;">Pièce</th>
          <th style="border: 1px solid #ddd; padding: 6px;">Heure</th>
          <th style="border: 1px solid #ddd; padding: 6px;">Motif</th>
          <th style="border: 1px solid #ddd; padding: 6px;">Bénéficiaire / Provenance</th>
          <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Entrée</th>
          <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Sortie</th>
        </tr>
      </thead>
      <tbody>
        ${dayTxs.map(t => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${t.pieceRecu}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${new Date(t.date).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${t.motif}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${t.beneficiaire}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: right; color: green; font-weight: ${t.type==='entree'?'bold':'normal'};">
              ${t.type === 'entree' ? formatCurrency(t.montant, currency) : '-'}
            </td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: right; color: red; font-weight: ${t.type==='sortie'?'bold':'normal'};">
              ${t.type === 'sortie' ? formatCurrency(t.montant, currency) : '-'}
            </td>
          </tr>
        `).join('')}
        <tr style="background: #f9fafb; font-weight: bold;">
          <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Totaux</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: green;">${formatCurrency(totalEntries, currency)}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: red;">${formatCurrency(totalExits, currency)}</td>
        </tr>
      </tbody>
    </table>

    ${billetageHtml}

    <div class="print-signatures" style="margin-top: 3.5rem;">
      <div class="print-signature-block">
        <div class="title">La Caissière</div>
        <div class="name">${currentUser.name}</div>
      </div>
      <div class="print-signature-block">
        <div class="title">Visa Contrôle RAF</div>
        <div class="name"></div>
      </div>
    </div>
  `;

  window.print();
}

// Imprimer l'état de régularisation (avant ou après)
function printRegularizationState(regId, stateMode) {
  const data = db.get();
  const reg = data.regularizations.find(r => r.id === regId);
  if (!reg) return;

  const currency = data.companyInfo.currency;
  const printArea = document.getElementById('print-container');

  const titleText = stateMode === 'avant' 
    ? "ÉTAT DE RAPPROCHEMENT AVANT RÉGULARISATION" 
    : "ÉTAT DE COMPTABILISATION APRÈS RÉGULARISATION";

  printArea.innerHTML = `
    <div class="print-header">
      <div class="print-hotel-details">
        <h2>${data.companyInfo.name}</h2>
        <p>Régularisation des dépenses de l'acheteuse</p>
      </div>
      <div style="text-align: right;">
        <p><strong>Réf :</strong> ${reg.id}</p>
        <p><strong>Acheteuse :</strong> ${reg.acheteuse}</p>
        <p><strong>Date d'état :</strong> ${new Date(reg.date).toLocaleDateString('fr-FR')}</p>
      </div>
    </div>

    <div class="print-voucher-title" style="margin: 1.5rem 0;">
      <h1 style="font-size: 1.3rem; border-width: 2px; padding: 0.5rem 1.5rem;">${titleText}</h1>
    </div>

    <h3 style="border-bottom: 2px solid #000; padding-bottom: 0.5rem; font-size: 1.15rem;">Détail unitaire des opérations</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="border: 1px solid #ddd; padding: 8px;">Date</th>
          <th style="border: 1px solid #ddd; padding: 8px;">N° Pièce</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Motif</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Montant Perçu</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Dépense Réelle</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Écart constaté</th>
        </tr>
      </thead>
      <tbody>
        ${reg.breakdown ? reg.breakdown.map(op => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${new Date(op.date).toLocaleDateString('fr-FR')}</td>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${op.pieceRecu}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${op.motif}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(op.montant, currency)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(op.montantReel, currency)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: ${op.ecart >= 0 ? 'green' : 'red'};">
              ${op.ecart >= 0 ? '+' : ''}${formatCurrency(op.ecart, currency)}
            </td>
          </tr>
        `).join('') : `<tr><td colspan="6" style="border: 1px solid #ddd; padding: 8px; text-align: center;">Pas de détails disponibles</td></tr>`}
        <tr style="background: #f9fafb; font-weight: bold;">
          <td colspan="3" style="border: 1px solid #ddd; padding: 10px; text-align: right;">Totaux de rapprochement</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatCurrency(reg.decaissementsEffectues, currency)}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatCurrency(reg.depensesReelles, currency)}</td>
          <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${reg.ecart >= 0 ? 'green' : 'red'};">
            ${reg.ecart >= 0 ? '+' : ''}${formatCurrency(reg.ecart, currency)}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="print-details-grid" style="margin-top: 2rem; margin-bottom: 2rem;">
      <div class="print-detail-item"><strong>Décaissements comptabilisés :</strong> ${formatCurrency(reg.decaissementsEffectues, currency)}</div>
      <div class="print-detail-item"><strong>Dépenses réellement exécutées :</strong> ${formatCurrency(reg.depensesReelles, currency)}</div>
      <div class="print-detail-item" style="grid-column: span 2; border-bottom: 2px solid #000; font-size: 1.2rem; font-weight: bold; margin-top: 1rem;">
        Écart global de régularisation : 
        <span class="${reg.ecart >= 0 ? 'text-success' : 'text-danger'}">
          ${reg.ecart >= 0 ? '+' : ''}${formatCurrency(reg.ecart, currency)}
        </span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #ddd; padding: 1rem; border-radius: 6px; font-size: 0.95rem; margin-bottom: 3rem;">
      <strong>Instruction financière :</strong><br>
      ${reg.ecart > 0 
        ? `L'acheteuse a dépensé moins que le budget octroyé. Elle doit restituer la somme de <strong>${formatCurrency(reg.ecart, currency)}</strong> à la caisse principale.`
        : reg.ecart < 0
          ? `L'acheteuse a dépensé plus que prévu. La caisse doit lui rembourser un complément de <strong>${formatCurrency(Math.abs(reg.ecart), currency)}</strong>.`
          : `Rapprochement équilibré. Aucun mouvement compensatoire requis.`
      }
      <br><br>
      <strong>Statut de l'état :</strong> <span style="text-transform: uppercase; font-weight: bold;">${reg.status === 'en_attente_validation' ? 'En attente de visa' : reg.status === 'valide' ? 'Validé par RAF (en attente finalisation)' : 'Finalisé en caisse'}</span>
      ${reg.validated_by ? `<br><strong>Validé par (RAF) :</strong> ${reg.validated_by}` : ''}
      ${reg.finalized_at ? `<br><strong>Finalisé le :</strong> ${new Date(reg.finalized_at).toLocaleDateString('fr-FR')} à ${new Date(reg.finalized_at).toLocaleTimeString('fr-FR')}` : ''}
    </div>

    <div class="print-signatures">
      <div class="print-signature-block">
        <div class="title">La Caissière</div>
        <div class="name"></div>
      </div>
      <div class="print-signature-block">
        <div class="title">L'Acheteuse</div>
        <div class="name">${reg.acheteuse}</div>
      </div>
    </div>
  `;

  window.print();
}// ---------------- CLOUD STATUS & SYNC HANDLERS ----------------

function updateCloudStatusIndicator() {
  const indicator = document.getElementById('sync-indicator');
  const syncText = document.getElementById('sync-text');
  if (indicator && syncText) {
    if (db.isCloudSync) {
      indicator.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      indicator.style.color = 'var(--success)';
      indicator.querySelector('.status-dot').style.background = 'var(--success)';
      syncText.textContent = "Cloud Connecté";
    } else {
      indicator.style.borderColor = 'var(--border-color)';
      indicator.style.color = 'var(--text-secondary)';
      indicator.querySelector('.status-dot').style.background = '#94A3B8';
      syncText.textContent = "Mode Local";
    }
  }
}

function shareAccessLink() {
  const configStr = localStorage.getItem('firebase_config');
  if (!configStr) {
    alert("Aucune configuration Cloud active.\nVeuillez d'abord configurer Firebase dans l'onglet Paramètres (accès RAF) avant de pouvoir partager l'accès.");
    return;
  }

  let encodedConfig;
  try {
    // Encoder la configuration JSON en Base64
    encodedConfig = btoa(configStr);
  } catch (e) {
    console.error("Erreur d'encodage de la config Firebase :", e);
    alert("Erreur lors de la préparation du lien de partage.");
    return;
  }

  // Fabriquer l'URL de partage avec le paramètre fb contenant la config
  const url = window.location.origin + window.location.pathname + '?fb=' + encodedConfig;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert("Lien d'accès partagé copié dans le presse-papiers !\nEnvoyez-le à vos collaborateurs. La connexion et la synchronisation de leur appareil se feront automatiquement dès qu'ils cliqueront sur le lien.");
    }).catch(err => {
      fallbackCopyText(url);
    });
  } else {
    fallbackCopyText(url);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";  // Evite de défiler vers le bas
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    alert("Lien d'accès partagé copié dans le presse-papiers !\nEnvoyez-le à vos collaborateurs. La connexion et la synchronisation de leur appareil se feront automatiquement dès qu'ils cliqueront sur le lien.");
  } catch (err) {
    console.error("Impossible de copier", err);
    alert("Impossible de copier le lien automatiquement. Veuillez copier manuellement l'adresse URL suivante :\n\n" + text);
  }
  document.body.removeChild(textarea);
}

// Enregistrer la configuration Firebase depuis les paramètres RAF
function handleFirebaseUpdateSubmit() {
  const configStr = document.getElementById('settings-firebase-config').value.trim();
  if (!configStr) {
    alert("Veuillez coller une configuration JSON Firebase valide ou cliquer sur Déconnecter.");
    return;
  }
  try {
    const config = JSON.parse(configStr);
    db.setFirebaseConfig(config);
    updateCloudStatusIndicator();
    alert("Configuration Firebase enregistrée avec succès. L'application est maintenant connectée au Cloud !");
    updateUI(db.get());
  } catch (e) {
    alert("Erreur : La configuration n'est pas au format JSON valide. Veuillez copier-coller l'objet de configuration JSON directement.");
  }
}

// Déconnecter Firebase
function handleFirebaseDisconnect() {
  if (confirm("Voulez-vous vraiment déconnecter l'application du Cloud ? Elle fonctionnera à nouveau de façon locale.")) {
    db.removeFirebaseConfig();
    document.getElementById('settings-firebase-config').value = '';
    updateCloudStatusIndicator();
    alert("Déconnexion réussie. Mode local réactivé.");
    updateUI(db.get());
  }
}
