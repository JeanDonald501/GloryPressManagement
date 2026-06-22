/**
 * GOLDEN CAISSE - Gestion de Base de Données & Synchronisation
 * Stockage basé sur LocalStorage avec synchronisation inter-onglets automatique.
 */

const DB_KEY = 'golden_caisse_db';
const FIREBASE_CONFIG_KEY = 'firebase_config';

// Structure par défaut de la base de données
const DEFAULT_DB = {
  companyInfo: {
    name: 'GOLDEN PALACE HÔTEL',
    address: 'Avenue de la Lagune, Abidjan, Côte d\'Ivoire',
    phone: '+225 27 22 40 00 00',
    email: 'info@goldenpalacehotel.ci',
    currency: 'FCFA'
  },
  users: [
    { id: 'usr_1', username: 'mariam', name: 'Mariam KOFFI', role: 'caissiere', password: '123' },
    { id: 'usr_2', username: 'jp', name: 'Jean-Paul KASSI', role: 'raf', password: '123' }
  ],
  caisses: {
    principale: {
      isOpen: false,
      openedAt: null,
      openedBy: null,
      initialBalance: 0,
      currentBalance: 0,
      billetage: null,
      closedAt: null
    },
    exploitation: {
      isOpen: false,
      openedAt: null,
      openedBy: null,
      initialBalance: 0,
      currentBalance: 0,
      billetage: null,
      closedAt: null
    }
  },
  transactions: [],
  regularizations: []
};

class GoldenCaisseDatabase {
  constructor() {
    this.listeners = [];
    this.firebaseApp = null;
    this.firebaseDb = null;
    this.isCloudSync = false;
    this.init();
    this.initFirebase();
    this.setupStorageListener();
  }

  // Initialisation de la BDD local
  init() {
    const data = localStorage.getItem(DB_KEY);
    if (!data) {
      // Premier lancement : on met les données par défaut (vides)
      this.save(DEFAULT_DB);
    } else {
      // On s'assure que toutes les structures sont cohérentes et qu'il n'y a pas de données de simulation résiduelles
      try {
        const parsed = JSON.parse(data);
        // Si la base contient les transactions de démo (ex: tx_p1), on force la réinitialisation
        const hasDemoData = parsed.transactions && parsed.transactions.some(tx => tx.id.startsWith('tx_p') || tx.id.startsWith('tx_e'));
        if (hasDemoData || !parsed.companyInfo || !parsed.users || !parsed.caisses) {
          this.save(DEFAULT_DB);
        }
      } catch (e) {
        this.save(DEFAULT_DB);
      }
    }
  }

  // Initialisation de Firebase
  initFirebase() {
    const configStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (!configStr) {
      this.isCloudSync = false;
      return;
    }
    try {
      const config = JSON.parse(configStr);
      // Éviter d'initialiser plusieurs fois
      if (typeof firebase !== 'undefined') {
        if (firebase.apps.length === 0) {
          this.firebaseApp = firebase.initializeApp(config);
        } else {
          this.firebaseApp = firebase.app();
        }
        this.firebaseDb = firebase.database();
        this.isCloudSync = true;
        this.setupFirebaseListener();
      }
    } catch (e) {
      console.error("Erreur d'initialisation Firebase :", e);
      this.isCloudSync = false;
    }
  }

  // Configuration de l'écouteur en temps réel Firebase
  setupFirebaseListener() {
    if (!this.isCloudSync || !this.firebaseDb) return;
    const ref = this.firebaseDb.ref('golden_caisse_db');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Mettre à jour localStorage localement comme cache
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        // Notifier les écouteurs locaux de l'UI
        this.listeners.forEach(callback => callback(data));
      } else {
        // Si Firebase est vide (première connexion), pousser les données locales ou défaut
        const localData = localStorage.getItem(DB_KEY);
        if (localData) {
          ref.set(JSON.parse(localData));
        } else {
          ref.set(DEFAULT_DB);
        }
      }
    }, (error) => {
      console.error("Erreur d'écoute Firebase (Vérifiez vos règles de sécurité) :", error);
    });
  }

  // Enregistrer ou modifier la configuration Firebase
  setFirebaseConfig(configObj) {
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(configObj));
    this.initFirebase();
    // Synchroniser immédiatement
    if (this.isCloudSync && this.firebaseDb) {
      const ref = this.firebaseDb.ref('golden_caisse_db');
      ref.once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
          // Firebase écrase le local
          localStorage.setItem(DB_KEY, JSON.stringify(data));
          this.listeners.forEach(callback => callback(data));
        } else {
          // Le local écrase Firebase
          ref.set(this.get());
        }
      });
    }
  }

  // Retirer la configuration Firebase et repasser en mode local
  removeFirebaseConfig() {
    if (this.isCloudSync && this.firebaseDb) {
      this.firebaseDb.ref('golden_caisse_db').off(); // Retirer les écouteurs
    }
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    this.isCloudSync = false;
    this.firebaseApp = null;
    this.firebaseDb = null;
    // Déclencher une mise à jour pour notifier l'UI
    this.listeners.forEach(callback => callback(this.get()));
  }

  // S'abonner aux changements de la base de données
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Écouteur pour la synchronisation inter-onglets (fallback local)
  setupStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === DB_KEY && !this.isCloudSync) {
        this.listeners.forEach(callback => callback(this.get()));
      }
    });
  }

  // Récupérer toute la base de données
  get() {
    const data = localStorage.getItem(DB_KEY);
    return JSON.parse(data);
  }

  // Sauvegarder toute la base de données
  save(data) {
    // 1. Sauvegarde locale (cache)
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    
    // 2. Sauvegarde Cloud si connecté
    if (this.isCloudSync && this.firebaseDb) {
      this.firebaseDb.ref('golden_caisse_db').set(data).catch(err => {
        console.error("Erreur d'écriture Cloud Firebase :", err);
      });
    }
    
    // 3. Notifier les écouteurs locaux
    this.listeners.forEach(callback => callback(data));
  }

  // Mettre à jour l'info de l'entreprise
  updateCompanyInfo(info) {
    const db = this.get();
    db.companyInfo = { ...db.companyInfo, ...info };
    this.save(db);
  }

  // Ajouter un utilisateur (agent)
  addUser(user) {
    const db = this.get();
    // Générer un ID unique
    user.id = 'usr_' + Date.now();
    db.users.push(user);
    this.save(db);
    return user;
  }

  // Ouvrir une caisse
  openCaisse(caisseName, amount, openedBy) {
    const db = this.get();
    if (db.caisses[caisseName]) {
      db.caisses[caisseName].isOpen = true;
      db.caisses[caisseName].openedAt = new Date().toISOString();
      db.caisses[caisseName].openedBy = openedBy;
      db.caisses[caisseName].initialBalance = amount;
      db.caisses[caisseName].currentBalance = amount;
      db.caisses[caisseName].billetage = null;
      db.caisses[caisseName].closedAt = null;
      this.save(db);
    }
  }

  // Fermer une caisse
  closeCaisse(caisseName, billetage, closedBy) {
    const db = this.get();
    if (db.caisses[caisseName]) {
      db.caisses[caisseName].isOpen = false;
      db.caisses[caisseName].closedAt = new Date().toISOString();
      db.caisses[caisseName].billetage = billetage;
      this.save(db);
    }
  }

  // Récupérer le prochain numéro de pièce
  getNextPieceNumber(caisseName, type) {
    const db = this.get();
    const prefix = type === 'entree' ? 'BE-' : 'BS-';
    const cLetter = caisseName === 'principale' ? 'P' : 'E'; // P pour Principale, E pour Exploitation
    const fullPrefix = `${prefix}${cLetter}`;
    
    // Filtrer les transactions de cette caisse et de ce type
    const relatedTxs = db.transactions.filter(tx => tx.pieceRecu && tx.pieceRecu.startsWith(fullPrefix));
    
    let maxNum = 0;
    relatedTxs.forEach(tx => {
      const numStr = tx.pieceRecu.replace(fullPrefix, '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    });

    const nextNum = maxNum + 1;
    // Formatage avec 3 chiffres (ex: BE-P001)
    return `${fullPrefix}${String(nextNum).padStart(3, '0')}`;
  }

  // Ajouter une transaction
  addTransaction(tx) {
    const db = this.get();
    tx.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    tx.date = new Date().toISOString();
    tx.pieceRecu = this.getNextPieceNumber(tx.caisse, tx.type);
    
    // Calculer le nouveau solde de la caisse
    const caisse = db.caisses[tx.caisse];
    if (tx.type === 'entree') {
      caisse.currentBalance += tx.montant;
    } else {
      caisse.currentBalance -= tx.montant;
    }

    db.transactions.push(tx);
    this.save(db);
    return tx;
  }

  // Justifier une pièce en attente de justificatif
  justifyTransaction(txId) {
    const db = this.get();
    const tx = db.transactions.find(t => t.id === txId);
    if (tx) {
      tx.justifie = true;
      this.save(db);
    }
  }

  // Transférer des fonds entre caisses
  transferFunds(fromCaisse, toCaisse, amount, user) {
    const db = this.get();
    
    // 1. Transaction de sortie de la caisse émettrice
    const outTx = {
      id: 'tx_' + Date.now() + '_out',
      caisse: fromCaisse,
      type: 'sortie',
      motif: `Transfert de fonds vers Caisse ${toCaisse === 'principale' ? 'Principale' : 'd\'Exploitation'}`,
      beneficiaire: `Caisse ${toCaisse === 'principale' ? 'Principale' : 'd\'Exploitation'}`,
      montant: amount,
      date: new Date().toISOString(),
      justificatifAttendu: false,
      justifie: true,
      pieceRecu: this.getNextPieceNumber(fromCaisse, 'sortie'),
      created_by: user
    };
    db.caisses[fromCaisse].currentBalance -= amount;
    db.transactions.push(outTx);

    // 2. Transaction d'entrée dans la caisse réceptrice
    const inTx = {
      id: 'tx_' + (Date.now() + 1) + '_in',
      caisse: toCaisse,
      type: 'entree',
      motif: `Transfert de fonds depuis Caisse ${fromCaisse === 'principale' ? 'Principale' : 'd\'Exploitation'}`,
      beneficiaire: `Caisse ${toCaisse === 'principale' ? 'Principale' : 'd\'Exploitation'}`,
      montant: amount,
      date: new Date().toISOString(),
      justificatifAttendu: false,
      justifie: true,
      pieceRecu: this.getNextPieceNumber(toCaisse, 'entree'),
      created_by: user
    };
    db.caisses[toCaisse].currentBalance += amount;
    db.transactions.push(inTx);

    this.save(db);
  }

  // Lancer une régularisation
  createRegularization(acheteuse, breakdown, user) {
    const db = this.get();
    
    let totalDecaissements = 0;
    let totalDepensesReelles = 0;
    let totalEcart = 0;
    const regId = 'reg_' + Date.now();

    breakdown.forEach(item => {
      const tx = db.transactions.find(t => t.id === item.txId);
      if (tx) {
        tx.regularizationId = regId;
        totalDecaissements += tx.montant;
        totalDepensesReelles += item.montantReel;
        totalEcart += item.ecart;
      }
    });

    const reg = {
      id: regId,
      date: new Date().toISOString(),
      acheteuse: acheteuse,
      decaissementsEffectues: totalDecaissements,
      depensesReelles: totalDepensesReelles,
      ecart: totalEcart,
      breakdown: breakdown, // Contient la liste unitaire avec { txId, pieceRecu, date, motif, montant, montantReel, ecart }
      status: 'en_attente_validation',
      created_at: new Date().toISOString(),
      validated_by: null,
      finalized_at: null
    };

    db.regularizations.push(reg);
    this.save(db);
    return reg;
  }

  // Valider une régularisation (RAF)
  validateRegularization(regId, rafUser) {
    const db = this.get();
    const reg = db.regularizations.find(r => r.id === regId);
    if (reg) {
      reg.status = 'valide';
      reg.validated_by = rafUser;
      this.save(db);
    }
  }

  // Finaliser une régularisation (Caissière)
  finalizeRegularization(regId, caissiereUser) {
    const db = this.get();
    const reg = db.regularizations.find(r => r.id === regId);
    if (reg && reg.status === 'valide') {
      reg.status = 'finalise';
      reg.finalized_at = new Date().toISOString();

      // Enregistrer l'opération financière résultant de l'écart
      if (reg.ecart > 0) {
        // Écart positif = Retour en caisse de l'acheteuse (Entrée)
        const inTx = {
          id: 'tx_' + Date.now() + '_reg_in',
          caisse: 'principale',
          type: 'entree',
          motif: `Retour de caisse après régularisation ${regId}`,
          beneficiaire: `Acheteuse (${reg.acheteuse})`,
          montant: reg.ecart,
          date: new Date().toISOString(),
          justificatifAttendu: false,
          justifie: true,
          pieceRecu: this.getNextPieceNumber('principale', 'entree'),
          created_by: caissiereUser,
          regularizationId: regId
        };
        db.caisses.principale.currentBalance += reg.ecart;
        db.transactions.push(inTx);
      } else if (reg.ecart < 0) {
        // Écart négatif = Décaissement complémentaire (Sortie)
        const outTx = {
          id: 'tx_' + Date.now() + '_reg_out',
          caisse: 'principale',
          type: 'sortie',
          motif: `Décaissement complémentaire après régularisation ${regId}`,
          beneficiaire: `Acheteuse (${reg.acheteuse})`,
          montant: Math.abs(reg.ecart),
          date: new Date().toISOString(),
          justificatifAttendu: false,
          justifie: true,
          pieceRecu: this.getNextPieceNumber('principale', 'sortie'),
          created_by: caissiereUser,
          regularizationId: regId
        };
        db.caisses.principale.currentBalance -= Math.abs(reg.ecart);
        db.transactions.push(outTx);
      }

      this.save(db);
    }
  }

  // Réinitialiser la base de données (si besoin de vider pour premier usage)
  resetDatabase() {
    this.save(DEFAULT_DB);
  }
}

// Exposer l'instance globale
window.db = new GoldenCaisseDatabase();
