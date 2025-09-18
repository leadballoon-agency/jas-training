// GoHighLevel Webhook Integration for JAS Training
// This handles all lead capture and sends data to GHL

const GHL_CONFIG = {
    // GHL webhook URL for Joe's campaign
    webhookUrl: 'https://services.leadconnectorhq.com/hooks/Mc5OUt3PKkpQtOUfUjk3/webhook-trigger/4637995f-8a5e-4481-ac6a-4a63fb14717d',

    // Optional: Add your location/campaign IDs
    locationId: '',
    campaignId: '',

    // Tags to add to leads
    tags: ['JAS Training', 'Safety Assessment', 'Facebook Ads']
};

// Lead capture from landing page
async function captureInitialLead(formData) {
    const leadData = {
        firstName: formData.get('firstName'),
        source: 'Landing Page - Assessment Start',
        tags: [...GHL_CONFIG.tags, 'Assessment Started'],
        customFields: {
            assessment_started: new Date().toISOString(),
            landing_page: window.location.href,
            utm_source: getURLParameter('utm_source') || 'direct',
            utm_medium: getURLParameter('utm_medium') || '',
            utm_campaign: getURLParameter('utm_campaign') || '',
            fbclid: getURLParameter('fbclid') || ''
        }
    };

    // Store in localStorage for assessment continuation
    localStorage.setItem('leadData', JSON.stringify(leadData));
    
    // Send initial lead to GHL (partial data)
    await sendToGHL(leadData);
}

// Complete lead capture after assessment
async function completeLeadCapture(assessmentData) {
    const storedData = JSON.parse(localStorage.getItem('leadData') || '{}');
    
    const completeLeadData = {
        ...storedData,
        email: assessmentData.email,
        phone: assessmentData.phone,
        company: assessmentData.company,
        industry: assessmentData.industry,
        source: 'Assessment Completed',
        tags: [...GHL_CONFIG.tags, 'Assessment Completed', `Risk Level: ${assessmentData.riskLevel}`],
        customFields: {
            ...storedData.customFields,
            assessment_completed: new Date().toISOString(),
            assessment_score: assessmentData.score,
            risk_level: assessmentData.riskLevel,
            compliance_gaps: assessmentData.complianceGaps.join(', '),
            immediate_needs: assessmentData.immediateNeeds.join(', '),
            estimated_value: calculateLeadValue(assessmentData)
        }
    };

    return await sendToGHL(completeLeadData);
}

// Send data to GoHighLevel webhook
async function sendToGHL(leadData) {
    try {
        // Create formatted notes with all assessment data
        const assessmentNotes = `
=== JAS TRAINING SAFETY ASSESSMENT RESULTS ===
Date: ${new Date().toLocaleString('en-GB')}

CONTACT DETAILS:
• Name: ${leadData.firstName || 'Not provided'}
• Email: ${leadData.email || 'Not provided'}
• Phone: ${leadData.phone || 'Not provided'}
• Company: ${leadData.company || 'Not provided'}
• Industry: ${leadData.industry || 'Not provided'}
• Employees: ${leadData.employees || 'Not provided'}

ASSESSMENT RESULTS:
• Risk Level: ${leadData.customFields?.risk_level || 'Not assessed'}
• Assessment Score: ${leadData.customFields?.assessment_score || '0'}
• Compliance Gaps: ${leadData.customFields?.compliance_gaps || 'None identified'}
• Immediate Needs: ${leadData.customFields?.immediate_needs || 'None identified'}

LEAD SOURCE:
• Source: ${leadData.customFields?.utm_source || 'Direct'}
• Medium: ${leadData.customFields?.utm_medium || 'Website'}
• Campaign: ${leadData.customFields?.utm_campaign || 'None'}
• FB Click ID: ${leadData.customFields?.fbclid || 'None'}

ESTIMATED VALUE: £${leadData.customFields?.estimated_value || '0'}

NEXT STEPS:
1. Call within 24 hours (Risk Level: ${leadData.customFields?.risk_level})
2. Review compliance gaps
3. Prepare training quote
4. Book consultation
        `.trim();

        // Format data for GHL webhook - simplified version
        const ghlPayload = {
            first_name: leadData.firstName || '',
            last_name: leadData.lastName || '',
            email: leadData.email || '',
            phone: leadData.phone || '',
            tags: leadData.tags || [],
            source: leadData.source || 'JAS Training Website',
            notes: assessmentNotes
        };

        // Add location ID if configured
        if (GHL_CONFIG.locationId) {
            ghlPayload.locationId = GHL_CONFIG.locationId;
        }

        const response = await fetch(GHL_CONFIG.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(ghlPayload)
        });

        if (!response.ok) {
            throw new Error(`GHL webhook failed: ${response.status}`);
        }

        // Track successful submission
        trackConversion('lead_captured', leadData);
        
        return { success: true, data: leadData };
        
    } catch (error) {
        console.error('GHL webhook error:', error);
        
        // Fallback: Store locally and retry later
        storeFailedLead(leadData);
        
        // Still return success to not break user experience
        return { success: true, fallback: true, error: error.message };
    }
}

// Calculate lead value based on assessment
function calculateLeadValue(assessmentData) {
    let value = 75; // Base training value per person
    
    // Multiply by estimated team size based on industry
    const teamSizeMultiplier = {
        'construction': 12,
        'manufacturing': 15,
        'offshore': 20,
        'corporate': 8,
        'other': 10
    };
    
    value *= teamSizeMultiplier[assessmentData.industry] || 10;
    
    // Add premium for high-risk scores
    if (assessmentData.riskLevel === 'critical') {
        value *= 1.5;
    }
    
    return value;
}

// Store failed leads for retry
function storeFailedLead(leadData) {
    const failedLeads = JSON.parse(localStorage.getItem('failedLeads') || '[]');
    failedLeads.push({
        ...leadData,
        failedAt: new Date().toISOString()
    });
    localStorage.setItem('failedLeads', JSON.stringify(failedLeads));
}

// Retry failed lead submissions
async function retryFailedLeads() {
    const failedLeads = JSON.parse(localStorage.getItem('failedLeads') || '[]');
    
    for (const lead of failedLeads) {
        const result = await sendToGHL(lead);
        if (result.success && !result.fallback) {
            // Remove from failed leads
            const remaining = failedLeads.filter(l => l !== lead);
            localStorage.setItem('failedLeads', JSON.stringify(remaining));
        }
    }
}

// Track conversions for Facebook Pixel and GA
function trackConversion(event, data) {
    // Facebook Pixel
    if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', {
            value: data.customFields?.estimated_value || 0,
            currency: 'GBP',
            content_name: 'Safety Assessment',
            content_category: data.customFields?.risk_level || 'unknown'
        });
    }
    
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
        gtag('event', event, {
            event_category: 'Lead Generation',
            event_label: data.source,
            value: data.customFields?.estimated_value || 0
        });
    }
}

// Utility function to get URL parameters
function getURLParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// Auto-retry failed leads on page load
window.addEventListener('load', () => {
    setTimeout(retryFailedLeads, 2000);
});

// Export for use in HTML pages
window.GHLIntegration = {
    captureInitialLead,
    completeLeadCapture,
    sendToGHL,
    trackConversion
};