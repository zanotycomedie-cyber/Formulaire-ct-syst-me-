const PDFDocument = require('pdfkit');

function genererPDFBuffer(titre, contenu) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0F5C3F').text(titre, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).fillColor('#111111').text(contenu, { align: 'left', lineGap: 4 });
    doc.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée' };
  }

  try {
    const data = JSON.parse(event.body);

    const prompt = `Tu es un conseiller pédagogique expert du système éducatif camerounais, travaillant pour CT SYSTÈME ("Le Système des Leaders Africains"). Tu crées des plannings d'étude personnalisés pour des élèves camerounais.

DONNÉES DE L'ÉLÈVE :
- Nom : ${data.nom_prenom || ''}
- Âge : ${data.age || ''}
- Ville/Quartier : ${data.ville_quartier || ''}
- Numéro WhatsApp de l'élève : ${data.whatsapp || ''}
- Encore à l'école : ${data.encore_ecole || ''}
- Classe : ${data.classe || 'non précisé'}
- Objectif principal : ${data.objectif_principal || ''} ${data.objectif_autre_precision || ''}
- Passion : ${data.passion || ''}
- Projet de vie : ${data.projet_vie || ''}
- Pourquoi c'est important : ${data.pourquoi_important || ''}
- Blocages exprimés : ${(data.blocages || []).join(', ')} ${data.blocage_autre_precision || ''}
- Type d'aide souhaitée : ${(data.aide_souhaitee || []).join(', ')} ${data.aide_autre_precision || ''}
- Temps disponible par jour : ${data.disponibilite || ''}
- Message libre de l'élève : ${data.message_libre || ''}

TA MISSION :
Génère un planning d'étude hebdomadaire personnalisé (7 jours), adapté au temps disponible déclaré. Le planning doit :
1. Prioriser les blocages exprimés par l'élève avec une réponse concrète à chacun
2. Relier si possible le planning à la passion et au projet de vie de l'élève (motivation)
3. Rester motivant et bienveillant dans le ton, jamais culpabilisant
4. Se terminer par 2-3 astuces courtes et actionnables liées à l'objectif principal

FORMAT DE SORTIE (texte brut) :

[Introduction courte et encourageante, 2 phrases max]

LUNDI
[créneau + action précise]

MARDI
...

[continuer pour les 7 jours]

Tes 3 astuces pour réussir :
1. ...
2. ...
3. ...

CONTRAINTES :
- Réponds uniquement avec le planning final, sans commentaire avant ou après
- Reste dans la limite du temps disponible déclaré par l'élève
- N'invente jamais de contenu de cours, reste sur de l'organisation et de la méthode
- Longueur totale : 300-400 mots maximum`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const claudeResult = await claudeResponse.json();
    const planningText = claudeResult.content && claudeResult.content[0]
      ? claudeResult.content[0].text
      : 'Erreur de génération du planning.';

    const titrePDF = `Programme personnalisé — ${data.nom_prenom || 'Élève'}`;
    const pdfBuffer = await genererPDFBuffer(titrePDF, planningText);
    const pdfBase64 = pdfBuffer.toString('base64');

    const nomFichier = `planning-${(data.nom_prenom || 'eleve').replace(/\s+/g, '-')}.pdf`;
    const legende =
      `📄 Nouveau planning généré\n` +
      `Élève : ${data.nom_prenom || ''}\n` +
      `Classe : ${data.classe || 'non précisé'}\n` +
      `WhatsApp élève : ${data.whatsapp || ''}\n\n` +
      `Vérifie et transmets-le à l'élève.`;

    await fetch('https://gate.whapi.cloud/messages/document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`
      },
      body: JSON.stringify({
        to: process.env.MON_NUMERO_WHATSAPP,
        media: `data:application/pdf;base64,${pdfBase64}`,
        filename: nomFichier,
        caption: legende
      })
    });

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
