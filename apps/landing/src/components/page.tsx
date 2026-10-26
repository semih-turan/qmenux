import type { ReactNode } from 'react';

/** Simple content frame for inner pages: heading, optional lead, body. */
export function ContentPage({ title, lead, children, prose = false }: { title: string; lead?: string; children: ReactNode; prose?: boolean }) {
  return (
    <section className="ld-section">
      <div className={`ld-wrap${prose ? ' ld-prose' : ''}`}>
        <h1 className="ld-h2">{title}</h1>
        {lead && <p className="ld-sub">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

/** Legal pages ship as clearly labelled drafts until counsel signs them (AGENTS.md: never present binding legal text as approved). */
export function LegalDraft({ title, scope }: { title: string; scope: string[] }) {
  return (
    <ContentPage title={title} prose lead="Taslak metin — hukuki inceleme bekliyor.">
      <div className="qx-banner qx-banner--warning" role="note">
        <div className="qx-banner__body">
          <p className="qx-banner__title">Bu metin henüz bağlayıcı değildir</p>
          <span>QMenuX yayına alınmadan önce bu sayfa yetkili hukuk danışmanı tarafından incelenip onaylanacaktır. Aşağıdaki başlıklar kapsamı gösterir; nihai metin onay tarihiyle birlikte yayımlanır.</span>
        </div>
      </div>
      <h2>Kapsam</h2>
      <ul>
        {scope.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <h2>Sorular</h2>
      <p>Bu sayfa hakkında sorularınız için iletişim sayfasındaki adresi kullanabilirsiniz.</p>
    </ContentPage>
  );
}
