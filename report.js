require('dotenv').config();
const nodeHtmlToImage = require('node-html-to-image');

/**
 * Builds the HTML template for the report.
 */
function buildReportHTML(sessionData) {
    const {
        driverName,
        branch,
        vehicleMake,
        vehicleModel,
        vehicleReg,
        checklistResults,
        comments,
        isEdited
    } = sessionData;

    const editBanner = isEdited ? `<div class="edit-banner">⚠️ CORRECTED REPORT</div>` : '';

    const dateStr = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
    
    let okCount = 0;
    let faultCount = 0;
    let faultsHtml = '';

    checklistResults.forEach(item => {
        if (item.status === 'OK') {
            okCount++;
        } else {
            faultCount++;
            faultsHtml += `<li class="fault-item"><strong>${item.item}:</strong> ${item.fault_description}</li>`;
        }
    });

    if (faultCount === 0) {
        faultsHtml = '<li>None</li>';
    }

    const html = `
    <html>
      <head>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f6;
            margin: 0;
            padding: 20px;
            color: #333;
            width: 800px;
          }
          .container {
            background-color: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #0056b3;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            color: #0056b3;
          }
          .edit-banner {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
            padding: 10px;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 1.1em;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #e9ecef;
            padding: 10px 15px;
            border-radius: 5px;
          }
          .info-label {
            font-weight: bold;
            color: #495057;
            font-size: 0.9em;
            text-transform: uppercase;
          }
          .info-value {
            font-size: 1.1em;
            margin-top: 5px;
          }
          .summary {
            display: flex;
            justify-content: space-around;
            background-color: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .summary div {
            text-align: center;
          }
          .summary h3 {
            margin: 0 0 5px 0;
          }
          .ok { color: #28a745; }
          .faults { color: #dc3545; }
          .section-title {
            color: #0056b3;
            border-bottom: 1px solid #dee2e6;
            padding-bottom: 5px;
            margin-bottom: 10px;
          }
          ul.fault-list {
            list-style-type: none;
            padding: 0;
          }
          li.fault-item {
            background-color: #ffeeba;
            padding: 10px;
            margin-bottom: 5px;
            border-radius: 5px;
            border-left: 4px solid #ffc107;
          }
          .comments-box {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            min-height: 50px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${editBanner}
          <div class="header">
            <h1>Vehicle Inspection Report</h1>
          </div>
          
          <div class="info-grid">
            <div class="info-box">
              <div class="info-label">Driver</div>
              <div class="info-value">${driverName} (${branch})</div>
            </div>
            <div class="info-box">
              <div class="info-label">Vehicle</div>
              <div class="info-value">${vehicleMake} ${vehicleModel} (${vehicleReg})</div>
            </div>
            <div class="info-box">
              <div class="info-label">Date & Time</div>
              <div class="info-value">${dateStr}</div>
            </div>
          </div>

          <div class="summary">
            <div>
              <h3 class="ok">✅ OK</h3>
              <strong>${okCount}</strong> items
            </div>
            <div>
              <h3 class="faults">❌ Faults</h3>
              <strong>${faultCount}</strong> items
            </div>
          </div>

          <h3 class="section-title">🔧 Faults Reported</h3>
          <ul class="fault-list">
            ${faultsHtml}
          </ul>

          <h3 class="section-title">💬 Additional Comments</h3>
          <div class="comments-box">
            ${comments || 'None provided.'}
          </div>
        </div>
      </body>
    </html>
    `;
    return html;
}

/**
 * Sends the final report to the configured WhatsApp group as an Image.
 */
async function sendReportToGroup(sock, sessionData) {
    const notifyJid = process.env.NOTIFY_GROUP_JID;
    if (!notifyJid) {
        console.warn('NOTIFY_GROUP_JID is not configured in .env. Skipping group notification.');
        return;
    }

    const htmlContent = buildReportHTML(sessionData);
    
    try {
        console.log('Generating image from HTML...');
        // Generate the image buffer
        const imageBuffer = await nodeHtmlToImage({
            html: htmlContent,
            quality: 100,
            type: 'jpeg'
        });
        
        console.log('Sending report image to group...');
        await sock.sendMessage(notifyJid, { 
            image: imageBuffer,
            caption: `Vehicle Inspection Report for ${sessionData.vehicleReg} by ${sessionData.driverName}`
        });
        console.log('Report image successfully sent to group.');
    } catch (err) {
        console.error('Failed to send report image to group:', err);
    }
}

module.exports = {
    buildReportHTML,
    sendReportToGroup
};
