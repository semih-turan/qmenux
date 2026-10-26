'use client';
import { formatPhone, type PublicMenu } from '@qmenux/contracts';
import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { sendMetric } from '@/lib/beacon';
import { telHref, whatsappHref } from '@/lib/format';

/** Address, hours, phone and the opt-in WhatsApp button. Hidden entirely when the owner filled none of them. */
export function Contact({ branch, whatsapp }: Pick<PublicMenu, 'branch' | 'whatsapp'>) {
  const tel = branch.phone ? telHref(branch.phone) : null;
  const wa = whatsapp ? whatsappHref(whatsapp.phone, whatsapp.message) : null;
  if (!branch.address && !branch.hoursText && !branch.phone && !wa) return null;
  return (
    <section className="m-contact" aria-labelledby="m-contact-title">
      <h2 id="m-contact-title">{branch.name || 'İletişim'}</h2>
      {branch.address && (
        <p className="m-contact__row">
          <MapPin size={18} aria-hidden="true" />
          <span>
            <span className="m-sr">Adres: </span>
            {branch.address}
          </span>
        </p>
      )}
      {branch.hoursText && (
        <p className="m-contact__row">
          <Clock size={18} aria-hidden="true" />
          <span className="m-contact__hours">
            <span className="m-sr">Çalışma saatleri: </span>
            {branch.hoursText}
          </span>
        </p>
      )}
      {branch.phone && (
        <p className="m-contact__row">
          <Phone size={18} aria-hidden="true" />
          {tel ? <a href={tel}>{formatPhone(branch.phone)}</a> : <span>{formatPhone(branch.phone)}</span>}
        </p>
      )}
      {wa && (
        <a
          className="m-btn m-btn--primary"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sendMetric('whatsapp_click')}
        >
          <MessageCircle size={20} aria-hidden="true" />
          WhatsApp ile yazın
        </a>
      )}
    </section>
  );
}
