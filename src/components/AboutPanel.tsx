import { ExternalLink, Info, MessageCircle, Wallet } from 'lucide-react';
import { whatsAppUrl } from '../logic/whatsapp';

const DEVELOPER = {
  name: 'Muhammad Shahbaz Arshad',
  intro:
    'I build simple, reliable business software for landlords and small businesses: programs that run on your own computer, work without the internet and keep your data in your hands.',
  whatsapp: '+968 9095 9084',
  whatsappDigits: '96890959084'
};

const PAYCORE_URL = 'https://paycoresalarysystem.com/';

const card = 'p-5 sm:p-6 rounded-2xl border shadow-xs space-y-3';
const linkButton =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer';

/** Settings → About: app version, the developer, and PayCore Salary System. Links open in the browser. */
export function AboutPanel() {
  const contactUrl = whatsAppUrl(DEVELOPER.whatsappDigits, 'Hello, I am using Rent Tracker.');

  return (
    <section aria-labelledby="about-heading" className="space-y-4">
      <div className={`${card} bg-white dark:bg-[#18232A] border-[#D5DDE3] dark:border-[#2B3A44]`}>
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
          <h3 id="about-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            About Rent Tracker
          </h3>
          <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">Version {__APP_VERSION__}</span>
        </div>
        <div>
          <p className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">Made by {DEVELOPER.name}</p>
          <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8] mt-1">{DEVELOPER.intro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {contactUrl && (
            <a
              href={contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkButton} bg-[#1F7A4D] text-white dark:bg-[#6CD39B] dark:text-[#10181D]`}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp {DEVELOPER.whatsapp}
            </a>
          )}
          <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">WhatsApp messages only, please.</span>
        </div>
      </div>

      <div className={`${card} bg-[#2E3F8F]/5 dark:bg-[#7D8CE8]/10 border-[#2E3F8F]/30 dark:border-[#7D8CE8]/30`}>
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
          <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">Also by {DEVELOPER.name.split(' ')[0]}: PayCore Salary System</h3>
        </div>
        <p className="text-sm font-semibold text-[#2E3F8F] dark:text-[#7D8CE8]">Payroll software without the monthly bill.</p>
        <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">
          Payroll for small and growing businesses, built for Oman and the Gulf. Like Rent Tracker, it runs offline on
          Windows and keeps your data on your own computer.
        </p>
        <ul className="text-sm text-[#1B2B34] dark:text-[#E6EDF1] list-disc pl-5 space-y-0.5">
          <li>Monthly payroll with overtime, loans, advances and end-of-service gratuity</li>
          <li>PDF payslips and Excel reports</li>
          <li>OMR, AED and SAR, WPS rules, full Arabic interface</li>
          <li>One-time licence, unlimited employees, automatic daily backups</li>
        </ul>
        <a
          href={PAYCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkButton} bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D]`}
        >
          Visit paycoresalarysystem.com <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </section>
  );
}
