const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

AOS.init({
  disable: prefersReducedMotion,
  // disable: false, // accepts following values: 'phone', 'tablet', 'mobile', boolean, expression or function
  // startEvent: 'DOMContentLoaded', // name of the event dispatched on the document, that AOS should initialize on
  // initClassName: 'aos-init', // class applied after initialization
  // animatedClassName: 'aos-animate', // class applied on animation
  // useClassNames: false, // if true, will add content of `data-aos` as classes on scroll
  // disableMutationObserver: false, // disables automatic mutations' detections (advanced)
  // debounceDelay: 50, // the delay on debounce used while resizing window (advanced)
  // throttleDelay: 99, // the delay on throttle used while scrolling the page (advanced)

  // offset: 120, // offset (in px) from the original trigger point
  // delay: 0, // values from 0 to 3000, with step 50ms
  // duration: 400, // values from 0 to 3000, with step 50ms
  easing: "ease", // default easing for AOS animations
  once: true, // whether animation should happen only once - while scrolling down
  // mirror: false, // whether elements should animate out while scrolling past them
  anchorPlacement: "top-bottom", // defines which position of the element regarding to window should trigger the animation
});

document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.querySelector(".navbar");
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.getElementById("nav-menu");
  const dropdowns = document.querySelectorAll(".has-dropdown");

  const closeDropdown = (dropdown) => {
    dropdown.classList.remove("active");
    dropdown.querySelector(".nav-link").setAttribute("aria-expanded", "false");
    const list = dropdown.querySelector(".dropdown");
    list.style.animation = "slideUp 0.3s forwards";
    setTimeout(() => {
      list.style.animation = "";
    }, 300);
  };

  // Off-canvas nav links shouldn't be reachable by keyboard while the
  // panel is translated off-screen (mobile breakpoint only) - inert is
  // a no-op in browsers that don't support it, so this is safe to add
  // unconditionally.
  const syncNavMenuInert = () => {
    const isMobile = window.innerWidth <= 968;
    const isOpen = navbar.classList.contains("nav-active");
    navMenu.toggleAttribute("inert", isMobile && !isOpen);
  };

  const setNavOpen = (isOpen) => {
    navbar.classList.toggle("nav-active", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
    document.body.classList.toggle("nav-open", isOpen);
    syncNavMenuInert();
  };

  navToggle.addEventListener("click", () => {
    setNavOpen(!navbar.classList.contains("nav-active"));
  });

  navToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      setNavOpen(!navbar.classList.contains("nav-active"));
    }
  });

  document.addEventListener("click", (e) => {
    const isClickOutside =
      !navbar.contains(e.target) && !navToggle.contains(e.target);
    if (isClickOutside && navbar.classList.contains("nav-active")) {
      setNavOpen(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const openDropdown = Array.from(dropdowns).find((d) =>
      d.classList.contains("active")
    );
    if (openDropdown) {
      closeDropdown(openDropdown);
      openDropdown.querySelector(".nav-link").focus();
      return;
    }

    if (navbar.classList.contains("nav-active")) {
      setNavOpen(false);
      navToggle.focus();
    }
  });

  dropdowns.forEach((dropdown) => {
    const link = dropdown.querySelector(".nav-link");
    link.addEventListener("click", (e) => {
      if (window.innerWidth <= 968) {
        e.preventDefault();
        const willOpen = !dropdown.classList.contains("active");

        dropdowns.forEach((other) => {
          if (other !== dropdown && other.classList.contains("active")) {
            closeDropdown(other);
          }
        });

        dropdown.classList.toggle("active", willOpen);
        link.setAttribute("aria-expanded", String(willOpen));

        const currentDropdown = dropdown.querySelector(".dropdown");
        if (willOpen) {
          currentDropdown.style.animation = "slideDown 0.3s forwards";
        } else {
          currentDropdown.style.animation = "slideUp 0.3s forwards";
          setTimeout(() => {
            currentDropdown.style.animation = "";
          }, 300);
        }
      }
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 968) {
      navbar.classList.remove("nav-active");
      navToggle.setAttribute("aria-expanded", "false");
      dropdowns.forEach((dropdown) => closeDropdown(dropdown));
      document.body.style.overflow = "";
      document.body.classList.remove("nav-open");
    }
    syncNavMenuInert();
  });

  syncNavMenuInert();

  const handleScrollClass = () => {
    navbar.classList.toggle("scrolled", window.scrollY > 50);
  };

  window.addEventListener("scroll", handleScrollClass);

  handleScrollClass();

  // Homepage Banner Slider
  var heroSwiper = new Swiper(".hero-bannerSection", {
    loop: true,
    speed: 900,
    allowTouchMove: false,
    autoplay: {
      delay: 6000,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
    },
    effect: "fade",
    fadeEffect: {
      crossFade: true,
    },
    navigation: {
      nextEl: ".hero-bannerSection .swiper-button-next",
      prevEl: ".hero-bannerSection .swiper-button-prev",
    },
    pagination: {
      el: ".hero-bannerSection .hero-progress-pagination",
      type: "progressbar",
    },
    keyboard: {
      enabled: true,
      onlyInViewport: true,
    },
    a11y: {
      enabled: true,
    },
  });

  // BG Parallax
  if (!prefersReducedMotion) {
  document.addEventListener("scroll", function () {
    const slides = document.querySelectorAll(
      ".hero-bannerSection .swiper-slide"
    );

    slides.forEach((slide) => {
      const bg = slide.querySelector(".slide-background-image");
      const text = slide.querySelector(".text-content-shell");
      const rect = slide.getBoundingClientRect();

      if (rect.top < window.innerHeight && rect.bottom > 0) {
        if (bg) {
          const bgTransformValue = rect.top * -0.2;
          bg.style.transform = `translateY(${bgTransformValue}px)`;
        }
        if (text) {
          const textTransformValue = rect.top * -0.4;
          text.style.transform = `translateY(${textTransformValue}px)`;
        }
      }
    });
  });

  // Text Content Parallax
  document.addEventListener("scroll", function () {
    const slides = document.querySelectorAll(
      ".hero-bannerSection .swiper-slide"
    );

    slides.forEach((slide) => {
      const textContent = slide.querySelector(".text-content-shell");

      if (textContent) {
        const rect = slide.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        if (rect.top < windowHeight && rect.bottom > 0) {
          const slideCenter = rect.top + rect.height / 2;
          const screenCenter = windowHeight / 2;
          const distanceFromCenter = slideCenter - screenCenter;
          const transformValue = distanceFromCenter * -0.3;

          textContent.style.transform = `translateY(${transformValue}px)`;
        }
      }
    });
  });
  }

  // Testimonial Slider
  var testimonialSwiper = new Swiper(".testimonial-slider", {
    loop: true,
    speed: 1000,
    allowTouchMove: false,
    effect: "fade",
    fadeEffect: {
      crossFade: true,
    },
    navigation: {
      nextEl: ".testimonial-slider .swiper-button-next",
      prevEl: ".testimonial-slider .swiper-button-prev",
    },
  });

  // Image Slider Only
  var imageOnlySwiper = new Swiper(".imageOnly-slider", {
    loop: true,
    speed: 1000,
    allowTouchMove: false,
    autoplay: {
      delay: 2500,
      disableOnInteraction: false,
    },
    slidesPerView: 2,
    breakpoints: {
      576: {
        slidesPerView: 3,
      },
      768: {
        slidesPerView: 4,
      },
      992: {
        slidesPerView: 5,
      },
    },
  });

});

// Stats Js
document.addEventListener("DOMContentLoaded", () => {
  const counters = document.querySelectorAll(".stat-number");
  const speed = 200; // The lower the number, the faster the count

  const animateCounter = (counter) => {
    const target = +counter.getAttribute("data-target");
    const updateCount = () => {
      const count = +counter.innerText.replace(/,/g, "");
      const increment = target / speed;

      if (count < target) {
        const newCount = Math.ceil(count + increment);
        counter.innerText = newCount.toLocaleString("en-IN");
        setTimeout(updateCount, 15);
      } else {
        counter.innerText = target.toLocaleString("en-IN");
      }
    };
    updateCount();
  };

  const observer = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.5,
    }
  );

  counters.forEach((counter) => {
    observer.observe(counter);
  });
});

// Scroll To Top JS
document.addEventListener("DOMContentLoaded", () => {
  const scrollToTopButton = document.querySelector(".scroll-to-top-button");

  if (scrollToTopButton) {
    const toggleButtonVisibility = () => {
      if (window.scrollY > 300) {
        scrollToTopButton.classList.add("is-visible");
      } else {
        scrollToTopButton.classList.remove("is-visible");
      }
    };

    const scrollToTop = (event) => {
      event.preventDefault();

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };

    window.addEventListener("scroll", toggleButtonVisibility);

    scrollToTopButton.addEventListener("click", scrollToTop);

    toggleButtonVisibility();
  }
});

// Bike listing (fetch/filter/paginate from Supabase) now lives in
// assets/js/bike-shop.js (a module - it needs to import the Supabase
// client), loaded directly by bike-shop.html.
