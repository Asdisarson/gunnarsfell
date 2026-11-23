// Browser behaviour that the WordPress theme and Elementor scripts used to provide:
// mobile menu, testimonial sliders, gallery lightbox and the contact forms.
import Swiper from 'swiper';
import { A11y, Autoplay, Navigation, Pagination } from 'swiper/modules';

/* Mobile menu (off-canvas drawer) --------------------------------------- */

function initMobileMenu() {
  const drawer = document.getElementById('ast-mobile-popup');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-open]');
  if (!drawer || !toggle) return;

  const setOpen = (open: boolean) => {
    drawer.classList.toggle('active', open);
    drawer.classList.toggle('show', open);
    document.body.classList.toggle('ast-popup-nav-open', open);
    document.body.classList.toggle('ast-main-header-nav-open', open);
    document.documentElement.classList.toggle('ast-off-canvas-active', open);
    toggle.classList.toggle('toggled', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) drawer.querySelector<HTMLElement>('[data-menu-close]:is(button)')?.focus();
    else if (drawer.contains(document.activeElement)) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!drawer.classList.contains('active')));
  drawer.querySelectorAll('[data-menu-close], a').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => event.key === 'Escape' && setOpen(false));
  window.addEventListener('resize', () => window.innerWidth > 921 && setOpen(false));
}

/* Testimonial sliders ---------------------------------------------------- */

interface CarouselSettings {
  speed?: number;
  autoplay?: string;
  autoplay_speed?: number;
  loop?: string;
  pause_on_hover?: string;
  pause_on_interaction?: string;
  space_between?: { size?: number };
}

function initCarousels() {
  document.querySelectorAll<HTMLElement>('.elementor-widget-testimonial-carousel').forEach((widget) => {
    const el = widget.querySelector<HTMLElement>('.swiper');
    if (!el || el.querySelectorAll('.swiper-slide').length < 2) return;
    // The settings Elementor stored for this widget.
    let settings: CarouselSettings = {};
    try {
      settings = JSON.parse(widget.dataset.settings ?? '{}');
    } catch {
      // Unreadable settings: the slider still works, on the defaults below.
    }
    new Swiper(el, {
      modules: [A11y, Autoplay, Navigation, Pagination],
      slidesPerView: 1,
      spaceBetween: settings.space_between?.size ?? 10,
      speed: settings.speed ?? 500,
      loop: settings.loop === 'yes',
      autoplay:
        settings.autoplay === 'yes' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? {
              delay: settings.autoplay_speed ?? 5000,
              disableOnInteraction: settings.pause_on_interaction === 'yes',
              pauseOnMouseEnter: settings.pause_on_hover === 'yes',
            }
          : false,
      navigation: {
        prevEl: widget.querySelector<HTMLElement>('.elementor-swiper-button-prev'),
        nextEl: widget.querySelector<HTMLElement>('.elementor-swiper-button-next'),
      },
      pagination: { el: widget.querySelector<HTMLElement>('.swiper-pagination'), type: 'bullets', clickable: true },
    });
  });
}

/* Gallery lightbox -------------------------------------------------------- */

function initLightbox() {
  const gallery = document.querySelector<HTMLElement>('.gallery[data-lightbox]');
  if (!gallery) return;
  const links = [...gallery.querySelectorAll<HTMLAnchorElement>('a')];

  const dialog = document.createElement('dialog');
  dialog.className = 'gf-lightbox';
  dialog.setAttribute('aria-label', 'Myndir');
  dialog.innerHTML = `
    <span class="gf-lightbox-count" aria-live="polite"></span>
    <button type="button" data-close aria-label="Loka">×</button>
    <button type="button" data-prev aria-label="Fyrri mynd">‹</button>
    <img alt="" />
    <button type="button" data-next aria-label="Næsta mynd">›</button>`;
  document.body.append(dialog);
  const image = dialog.querySelector('img')!;
  const count = dialog.querySelector('.gf-lightbox-count')!;
  let index = 0;

  const show = (next: number) => {
    index = (next + links.length) % links.length;
    const link = links[index];
    image.src = link.href;
    image.alt = link.querySelector('img')?.alt ?? '';
    count.textContent = `${index + 1} / ${links.length}`;
    // Warm the neighbour so "next" is instant.
    new Image().src = links[(index + 1) % links.length].href;
  };

  links.forEach((link, i) =>
    link.addEventListener('click', (event) => {
      event.preventDefault();
      show(i);
      dialog.showModal();
    }),
  );
  dialog.querySelector('[data-prev]')!.addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-next]')!.addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  let touchX = 0;
  dialog.addEventListener('touchstart', (event) => (touchX = event.changedTouches[0].clientX), { passive: true });
  dialog.addEventListener(
    'touchend',
    (event) => {
      const delta = event.changedTouches[0].clientX - touchX;
      if (Math.abs(delta) > 50) show(index + (delta < 0 ? 1 : -1));
    },
    { passive: true },
  );
}

/* Contact forms ----------------------------------------------------------- */

const SUCCESS = 'Takk fyrir að hafa samband. Við munum vera í sambandi við þig';
const FAILURE = 'Ekki tókst að senda. Reyndu aftur eða hringdu í okkur í síma 546-4466.';

function initForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-contact-form]').forEach((form) => {
    const loadedAt = Date.now();
    const button = form.querySelector<HTMLButtonElement>('.wpforms-submit')!;
    const error = form.querySelector<HTMLElement>('.gf-form-error')!;

    const fail = (message: string, fields: Record<string, string> = {}) => {
      error.textContent = message;
      error.hidden = false;
      for (const name of Object.keys(fields)) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLElement) field.classList.add('gf-invalid');
      }
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      form.querySelectorAll('.gf-invalid').forEach((el) => el.classList.remove('gf-invalid'));
      if (!form.checkValidity()) {
        form.querySelectorAll<HTMLElement>(':invalid').forEach((el) => el.classList.add('gf-invalid'));
        form.querySelector<HTMLElement>(':invalid')?.focus();
        return fail('Vinsamlegast fylltu út reitina sem vantar.');
      }

      const body = Object.fromEntries(new FormData(form)) as Record<string, string | number>;
      body.timi = Date.now() - loadedAt;
      button.disabled = true;
      button.textContent = button.dataset.altText ?? 'Sendist...';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return fail(result.message ?? FAILURE, result.data?.fields);
        const done = document.createElement('div');
        done.className = 'gf-form-success';
        done.setAttribute('role', 'status');
        done.textContent = SUCCESS;
        form.replaceWith(done);
        done.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        fail(FAILURE);
      } finally {
        button.disabled = false;
        button.textContent = button.dataset.submitText ?? 'Senda';
      }
    });
  });
}

initMobileMenu();
initCarousels();
initLightbox();
initForms();
