// Fonction serveur — Netlify Function
// Fichier à placer dans : netlify/functions/generer-planning.js
//
// CE QUE FAIT CETTE FONCTION MAINTENANT (version simplifiée, SANS IA) :
// 1. Reçoit les réponses brutes du formulaire rempli par l'élève
// 2. Les met en forme proprement
// 3. Transforme ça en PDF
// 4. Envoie ce PDF sur TON WhatsApp — c'est toi qui décides ensuite quoi en faire
//    (le donner tel quel, le passer dans Claude/ChatGPT pour générer le planning, etc.)
//
// PACKAGES NPM À INSTALLER PAR LE DÉVELOPPEUR :
//   npm install pdfkit
//
// CLÉS À CONFIGURER (seulement 2 maintenant, plus besoin d'ANTHROPIC_API_KEY) :
// 1. Compte Whapi.Cloud (https://whapi.cloud) → créer un "channel", scanner le QR code
//    avec TON WhatsApp personnel → copier le token du channel
//    → variable d'env WHAPI_TOKEN
// 2. Ton numéro WhatsApp (celui qui reçoit les PDF), format international sans "+"
//    ex: 237699999999 → variable d'env MON_NUMERO_WHATSAPP

const PDFDocument = require('pdfkit');

function genererPDFBuffer(titre, lignes) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0F5C3F').text(titre, { align: 'center' });
    doc.moveDown(1.5);

    lignes.forEach(({ label, value }) => {
      doc.fontSize(11).fillColor('#0F5C3F').text(label, { continued: false });
      doc.fontSize(11).fillColor('#111111').text(value || '(non renseigné)');
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const data = JSON.parse(event.body);

    // Mise en forme lisible des réponses du formulaire
    const lignes = [
      { label: 'Nom et prénom :', value: data.nom_prenom },
      { label: 'Âge :', value: data.age },
      { label: 'Ville / Quartier :', value: data.ville_quartier },
      { label: 'Numéro WhatsApp de l\'élève :', value: data.whatsapp },
      { label: 'Encore à l\'école :', value: data.encore_ecole },
      { label: 'Classe :', value: data.classe },
      { label: 'Depuis quand arrêté (si non scolarisé) :', value: data.depuis_quand_arret },
      { label: 'Redoublement / échecs :', value: data.redoublement_echecs },
      { label: 'Objectif principal :', value: [data.objectif_principal, data.objectif_autre_precision].filter(Boolean).join(' — ') },
      { label: 'Passion :', value: data.passion },
      { label: 'Projet de vie :', value: data.projet_vie },
      { label: 'Pourquoi c\'est important :', value: data.pourquoi_important },
      { label: 'Blocages exprimés :', value: [...(data.blocages || []), data.blocage_autre_precision].filter(Boolean).join(', ') },
      { label: 'Type d\'aide souhaitée :', value: [...(data.aide_souhaitee || []), data.aide_autre_precision].filter(Boolean).join(', ') },
      { label: 'Disponibilité par jour :', value: data.disponibilite },
      { label: 'Message libre de l\'élève :', value: data.message_libre }
    ];

    const titrePDF = `Formulaire reçu — ${data.nom_prenom || 'Élève'}`;
    const pdfBuffer = await genererPDFBuffer(titrePDF, lignes);

    // ÉTAPE 3 : envoi du PDF sur TON WhatsApp via Whapi.Cloud
    // (envoi en multipart/form-data — format confirmé par la documentation officielle Whapi)
    const nomFichier = `formulaire-${(data.nom_prenom || 'eleve').replace(/\s+/g, '-')}.pdf`;
    const legende =
      `📄 Nouveau formulaire reçu\n` +
      `Élève : ${data.nom_prenom || ''}\n` +
      `Classe : ${data.classe || 'non précisé'}\n` +
      `WhatsApp élève : ${data.whatsapp || ''}\n\n` +
      `À toi de traiter la demande.`;

    const formData = new FormData();
    formData.append('to', process.env.MON_NUMERO_WHATSAPP);
    formData.append('caption', legende);
    formData.append('media', new Blob([pdfBuffer], { type: 'application/pdf' }), nomFichier);

    const whapiResponse = await fetch('https://gate.whapi.cloud/messages/document', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`
      },
      body: formData
    });

    const whapiResult = await whapiResponse.text();
    // Ce log apparaît dans Netlify > Functions > generer-planning > logs.
    // Utile pour voir précisément pourquoi Whapi refuse l'envoi si ça persiste.
    console.log('Réponse Whapi:', whapiResponse.status, whapiResult);

    if (!whapiResponse.ok) {
      throw new Error(`Whapi a refusé l'envoi (code ${whapiResponse.status}): ${whapiResult}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
