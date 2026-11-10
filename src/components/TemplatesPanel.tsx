import { useRef, useState } from 'react';
import { ChevronDown, MessageCircle, RotateCcw, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  activeTemplate,
  MAX_TEMPLATE_LENGTH,
  MessageTemplateKey,
  MessageTemplates,
  renderTemplate,
  SAMPLE_VALUES,
  TEMPLATE_SPECS,
  templateSpec,
  unknownFields
} from '../logic/templates';

/** Edit the wording of every WhatsApp message the app sends. */
export function TemplatesPanel() {
  const [openKey, setOpenKey] = useState<MessageTemplateKey | null>(null);
  return (
    <section
      aria-labelledby="templates-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4"
    >
      <div>
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
          <h3 id="templates-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            WhatsApp messages
          </h3>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Change the wording of messages you send. Words in {'{braces}'} are filled in for each tenant; a line whose field is
          empty (for example no landlord name) is left out.
        </p>
      </div>
      <ul className="divide-y divide-[#D5DDE3] dark:divide-[#2B3A44] border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl">
        {TEMPLATE_SPECS.map((spec) => (
          <li key={spec.key}>
            <button
              type="button"
              aria-expanded={openKey === spec.key}
              onClick={() => setOpenKey(openKey === spec.key ? null : spec.key)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <span>
                <span className="block text-sm font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">{spec.title}</span>
                <span className="block text-xs text-[#5E6E78] dark:text-[#8E9EA8]">{spec.description}</span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openKey === spec.key ? 'rotate-180' : ''}`} />
            </button>
            {openKey === spec.key && <TemplateEditor templateKey={spec.key} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TemplateEditor({ templateKey }: { templateKey: MessageTemplateKey }) {
  const { settings, updateSettings } = useApp();
  const saved = settings.messageTemplates as MessageTemplates | undefined;
  const spec = templateSpec(templateKey);
  const [text, setText] = useState(activeTemplate(templateKey, saved));
  const [status, setStatus] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const unknown = unknownFields(templateKey, text);
  const isDefault = text.trim() === spec.defaultText;
  const preview = renderTemplate(text.trim() ? text : spec.defaultText, SAMPLE_VALUES);

  const insertField = (field: string) => {
    const el = areaRef.current;
    const token = `{${field}}`;
    if (!el) return setText(text + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async (value: string) => {
    const next: MessageTemplates = { ...(saved || {}) };
    // Storing nothing means "use the default", so future improvements to the default reach you.
    if (!value.trim() || value.trim() === spec.defaultText) delete next[templateKey];
    else next[templateKey] = value.slice(0, MAX_TEMPLATE_LENGTH);
    await updateSettings({ messageTemplates: next });
    setStatus('Saved');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="px-4 pb-4 space-y-3">
      <textarea
        ref={areaRef}
        aria-label={`${spec.title} message`}
        value={text}
        maxLength={MAX_TEMPLATE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full px-3 py-2 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-sm text-[#1B2B34] dark:text-[#E6EDF1] font-mono focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mr-1">Insert:</span>
        {spec.fields.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => insertField(f)}
            className="px-2 py-0.5 rounded-md text-xs font-mono border border-[#D5DDE3] dark:border-[#2B3A44] text-[#2E3F8F] dark:text-[#7D8CE8] hover:bg-[#EDF1F4] dark:hover:bg-[#24333D] cursor-pointer min-h-0"
          >
            {`{${f}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p role="alert" className="text-xs font-semibold text-[#B4341F] dark:text-[#FF8A73]">
          Not a field for this message: {unknown.map((f) => `{${f}}`).join(', ')}. It will be sent exactly as typed.
        </p>
      )}
      <div>
        <div className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">Preview (sample tenant)</div>
        <p className="whitespace-pre-line text-sm p-3 rounded-lg bg-[#E8F7EE]/60 dark:bg-[#143523]/60 text-[#1B2B34] dark:text-[#E6EDF1]">
          {preview}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => save(text)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        {!isDefault && (
          <button
            type="button"
            onClick={() => {
              setText(spec.defaultText);
              save(spec.defaultText);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-[#EDF1F4] dark:hover:bg-[#24333D] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore default
          </button>
        )}
        {status && <span className="text-xs font-semibold text-[#1F7A4D] dark:text-[#6CD39B]">{status}</span>}
      </div>
    </div>
  );
}
