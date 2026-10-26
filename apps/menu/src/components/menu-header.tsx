import type { PublicMenu } from '@qmenux/contracts';

export function MenuHeader({ menu }: { menu: Pick<PublicMenu, 'displayName' | 'tagline' | 'logoUrl'> }) {
  return (
    <header className="m-hd">
      <div className="m-wrap">
        <div className="m-hd__inner">
          {/* The name is right beside it, so the logo is decorative for screen readers. */}
          {menu.logoUrl && <img className="m-hd__logo" src={menu.logoUrl} alt="" width={60} height={60} decoding="async" />}
          <div className="m-hd__text">
            <h1 className="m-hd__name">{menu.displayName}</h1>
            {menu.tagline && <p className="m-hd__tagline">{menu.tagline}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}
