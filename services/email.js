/**
 * Revora — Centralized Email Service
 * All email sending consolidated here with retry logic and templates.
 */
const nodemailer = require('nodemailer');

// --- SINGLETON TRANSPORTER ---
let transporter = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_FROM,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }
    return transporter;
}

// --- RETRY LOGIC ---
async function sendWithRetry(mailOptions, retries = 3) {
    const transport = getTransporter();
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await transport.sendMail(mailOptions);
            console.log(`✅ [EMAIL] Sent to ${mailOptions.to} (attempt ${attempt})`);
            return result;
        } catch (err) {
            console.error(`❌ [EMAIL] Attempt ${attempt}/${retries} failed for ${mailOptions.to}:`, err.message);
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential backoff
        }
    }
}

// --- COMMON WRAPPER ---
async function sendEmail({ to, subject, html }) {
    return sendWithRetry({
        from: `"Revora" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html: wrapTemplate(html)
    });
}

// --- HTML TEMPLATE WRAPPER ---
function wrapTemplate(bodyContent) {
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; background: #F5F3FF; font-family: 'Segoe UI', Arial, sans-serif; }
  .email-container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(124,58,237,0.08); }
  .email-header { background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%); padding: 28px 32px; text-align: center; }
  .email-logo { font-size: 26px; font-weight: 800; color: #FFFFFF; letter-spacing: -1px; }
  .email-logo span { color: #F59E0B; }
  .email-body { padding: 32px; color: #1F2937; line-height: 1.7; font-size: 15px; }
  .email-body h2 { font-size: 20px; font-weight: 700; color: #7C3AED; margin: 0 0 16px; }
  .email-body p { margin: 0 0 14px; }
  .email-btn { display: inline-block; padding: 12px 28px; background: #7C3AED; color: #FFFFFF !important; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; margin: 8px 0; }
  .email-btn:hover { background: #6D28D9; }
  .email-footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #9CA3AF; border-top: 1px solid #F3F4F6; }
  .email-highlight { background: #F5F3FF; border-radius: 10px; padding: 16px 20px; margin: 16px 0; border-left: 4px solid #7C3AED; }
  .email-highlight strong { color: #7C3AED; }
</style>
</head>
<body>
<div style="padding: 24px;">
  <div class="email-container">
    <div class="email-header">
      <div class="email-logo">R<span>evora</span></div>
    </div>
    <div class="email-body">
      ${bodyContent}
    </div>
    <div class="email-footer">
      <p>© ${new Date().getFullYear()} Revora — Subscription Management Platform</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// SPECIFIC EMAIL FUNCTIONS
// ============================================================

/** Password Reset Email */
async function sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password.html?token=${resetToken}`;
    await sendEmail({
        to: user.email,
        subject: '🔐 Password Reset — Revora',
        html: `
            <h2>Password Reset Request</h2>
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>We received a request to reset the password for your Revora account. Click the button below to set a new password:</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="email-btn">Reset My Password</a>
            </p>
            <div class="email-highlight">
                <strong>⏳ This link expires in 1 hour.</strong> If you didn't request this, you can safely ignore this email.
            </div>
            <p style="font-size: 12px; color: #9CA3AF;">Direct link: <a href="${resetUrl}" style="color: #7C3AED;">${resetUrl}</a></p>
        `
    });
}

/** Overdue Invoice Email */
async function sendOverdueInvoiceEmail(invoice, customer) {
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/invoices-detail.html?id=${invoice.id}`;
    await sendEmail({
        to: customer.email,
        subject: `⚠️ Overdue Invoice ${invoice.invoiceNumber} — Revora`,
        html: `
            <h2>Payment Overdue</h2>
            <p>Dear <strong>${customer.name}</strong>,</p>
            <p>Your invoice is overdue. Please settle it at your earliest convenience.</p>
            <div class="email-highlight">
                <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
                <p><strong>Amount Due:</strong> $${(invoice.amountDue || 0).toFixed(2)}</p>
                <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString('en-US')}</p>
            </div>
            <p style="text-align: center;">
                <a href="${portalUrl}" class="email-btn">View Invoice</a>
            </p>
        `
    });
}

/** Renewal Reminder Email */
async function sendRenewalReminderEmail(subscription, customer) {
    await sendEmail({
        to: customer.email,
        subject: `🔔 Renewal Reminder — ${subscription.subscriptionNumber}`,
        html: `
            <h2>Subscription Renewal Reminder</h2>
            <p>Hi <strong>${customer.name}</strong>,</p>
            <p>Your subscription will renew in <strong>7 days</strong>.</p>
            <div class="email-highlight">
                <p><strong>Subscription:</strong> ${subscription.subscriptionNumber}</p>
                <p><strong>Plan:</strong> ${subscription.plan?.name || 'N/A'}</p>
                <p><strong>Next Billing Date:</strong> ${new Date(subscription.nextBillingDate).toLocaleDateString('en-US')}</p>
            </div>
            <p>Log in to your portal to manage your subscription.</p>
        `
    });
}

/** Invoice Email (send to customer) */
async function sendInvoiceEmail(invoice, customer) {
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/invoices-detail.html?id=${invoice.id}`;
    await sendEmail({
        to: customer.email,
        subject: `📄 Invoice ${invoice.invoiceNumber} — $${invoice.total.toFixed(2)}`,
        html: `
            <h2>New Invoice</h2>
            <p>Dear <strong>${customer.name}</strong>,</p>
            <p>A new invoice has been generated for your account.</p>
            <div class="email-highlight">
                <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
                <p><strong>Total:</strong> $${invoice.total.toFixed(2)}</p>
                <p><strong>Due Date:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US') : 'N/A'}</p>
            </div>
            <p style="text-align: center;">
                <a href="${portalUrl}" class="email-btn">View & Pay Invoice</a>
            </p>
        `
    });
}

/** Subscription Request Submitted (to portal user) */
async function sendSubscriptionRequestedEmail(customer, subscriptionNumber) {
    await sendEmail({
        to: customer.email,
        subject: `✅ Subscription Request Submitted — ${subscriptionNumber}`,
        html: `
            <h2>Request Submitted</h2>
            <p>Hi <strong>${customer.name}</strong>,</p>
            <p>Your subscription request <strong>${subscriptionNumber}</strong> has been submitted successfully.</p>
            <div class="email-highlight">
                <strong>⏳ What happens next?</strong>
                <p>An admin will review your request. You'll be notified once it's approved or if we need more information.</p>
            </div>
        `
    });
}

/** New Subscription Request (to admin) */
async function sendAdminNewRequestEmail(adminEmail, customer, subscriptionNumber) {
    const approvalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/pending-approval.html`;
    await sendEmail({
        to: adminEmail,
        subject: `🆕 New Subscription Request from ${customer.name}`,
        html: `
            <h2>New Subscription Request</h2>
            <p>A new subscription request has been submitted and requires your approval.</p>
            <div class="email-highlight">
                <p><strong>Customer:</strong> ${customer.name} (${customer.email})</p>
                <p><strong>Subscription:</strong> ${subscriptionNumber}</p>
            </div>
            <p style="text-align: center;">
                <a href="${approvalUrl}" class="email-btn">Review Request</a>
            </p>
        `
    });
}

/** Admin Approved — Notify Staff */
async function sendStaffApprovalNeededEmail(staffEmail, subscriptionNumber, customerName) {
    const staffUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/staff-approval.html`;
    await sendEmail({
        to: staffEmail,
        subject: `📋 Approval Needed — ${subscriptionNumber}`,
        html: `
            <h2>Subscription Awaiting Your Approval</h2>
            <p>Admin has approved this subscription request. It now requires your final approval.</p>
            <div class="email-highlight">
                <p><strong>Customer:</strong> ${customerName}</p>
                <p><strong>Subscription:</strong> ${subscriptionNumber}</p>
            </div>
            <p style="text-align: center;">
                <a href="${staffUrl}" class="email-btn">Review & Approve</a>
            </p>
        `
    });
}

/** Subscription Activated (to customer) */
async function sendSubscriptionActivatedEmail(customer, subscriptionNumber) {
    await sendEmail({
        to: customer.email,
        subject: `🎉 Subscription Activated — ${subscriptionNumber}`,
        html: `
            <h2>Your Subscription is Active!</h2>
            <p>Hi <strong>${customer.name}</strong>,</p>
            <p>Great news! Your subscription <strong>${subscriptionNumber}</strong> has been approved and is now active.</p>
            <div class="email-highlight">
                <strong>✅ Your first invoice has been generated.</strong>
                <p>Log in to your portal to view your subscription details and invoice.</p>
            </div>
        `
    });
}

/** Subscription Rejected (to customer) */
async function sendSubscriptionRejectedEmail(customer, subscriptionNumber, reason) {
    await sendEmail({
        to: customer.email,
        subject: `❌ Subscription Request Rejected — ${subscriptionNumber}`,
        html: `
            <h2>Subscription Request Rejected</h2>
            <p>Hi <strong>${customer.name}</strong>,</p>
            <p>Unfortunately, your subscription request <strong>${subscriptionNumber}</strong> has been rejected.</p>
            ${reason ? `<div class="email-highlight"><strong>Reason:</strong> ${reason}</div>` : ''}
            <p>If you have questions, please contact our support team.</p>
        `
    });
}

/** Verify SMTP connection */
async function verifyConnection() {
    try {
        const transport = getTransporter();
        await transport.verify();
        console.log('✅ [EMAIL] SMTP connection verified');
        return true;
    } catch (err) {
        console.error('❌ [EMAIL] SMTP verification failed:', err.message);
        return false;
    }
}

module.exports = {
    sendEmail,
    sendPasswordResetEmail,
    sendOverdueInvoiceEmail,
    sendRenewalReminderEmail,
    sendInvoiceEmail,
    sendSubscriptionRequestedEmail,
    sendAdminNewRequestEmail,
    sendStaffApprovalNeededEmail,
    sendSubscriptionActivatedEmail,
    sendSubscriptionRejectedEmail,
    verifyConnection
};
