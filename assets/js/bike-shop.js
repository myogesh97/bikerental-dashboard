// Bike listing for bike-shop.html: fetches from Supabase (replacing
// the old static assets/js/bikes-data.js), filters by brand/category,
// and paginates client-side.
//
// Deliberately NOT included: an "availability" filter/tag. The old
// static site had one, but it was fake data (a static field with no
// real meaning) - this project's hard rule is "no mocked availability".
// Real per-date availability needs get_availability() (Phase 3), which
// checks actual bookings/bike_blocks for the dates a customer picks.
// Until then, this page honestly shows "this is in our catalog", not
// "this is available right now" - showing nothing is more honest than
// showing a fake status tag.
import { supabase } from "./supabase-client.js";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("bikesGrid");
  if (!grid) return;

  const statusRegion = document.getElementById("bikesStatus");
  const form = document.getElementById("bikeFilterForm");
  const category = document.getElementById("filterCategory");
  const brand = document.getElementById("filterBrand");
  const resultsCount = document.getElementById("resultsCount");
  const viewPage = document.getElementById("viewPage");
  const paginationContainer = document.getElementById("paginationContainer");

  const PAGE_SIZE = 8;
  let currentPage = 1;
  let allBikes = [];
  let loadError = null;

  const cardMarkup = (bike) => `
    <div class="col-lg-3 col-sm-6 col-md-4">
        <div class="motorcycle-card" data-category="${bike.category}" data-brand="${bike.brand}">
            <div class="card-image">
                <a href="bike.html?slug=${bike.slug}">
                    <img src="${bike.image_path}" alt="${bike.name}" loading="lazy">
                </a>
            </div>
            <div class="card-content">
                <h3><a href="bike.html?slug=${bike.slug}">${bike.name}</a></h3>
                <div class="price">&#8377;${(bike.price_paise / 100).toFixed(0)}<span class="per-day">/day</span></div>
                <div class="card-actions">
                    <a href="bike.html?slug=${bike.slug}" class="btn btn-primary">Details</a>
                </div>
            </div>
        </div>
    </div>`;

  const getFilteredBikes = () => {
    const categoryValue = category.value;
    const brandValue = brand.value;

    return allBikes.filter((bike) => {
      const matchCat = categoryValue === "all" || bike.category === categoryValue;
      const matchBrand = brandValue === "all" || bike.brand === brandValue;
      return matchCat && matchBrand;
    });
  };

  const renderPagination = (totalPages) => {
    paginationContainer.innerHTML = "";
    if (totalPages <= 1) return;

    for (let page = 1; page <= totalPages; page++) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-numbers" + (page === currentPage ? " current" : "");
      btn.textContent = String(page);
      if (page === currentPage) {
        btn.setAttribute("aria-current", "page");
      }
      btn.addEventListener("click", () => {
        currentPage = page;
        render();
        grid.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      });
      li.appendChild(btn);
      paginationContainer.appendChild(li);
    }
  };

  const render = () => {
    if (loadError) {
      grid.innerHTML = "";
      paginationContainer.innerHTML = "";
      resultsCount.textContent = "";
      viewPage.textContent = "";
      statusRegion.textContent =
        "We couldn't load the bike listing right now. Please refresh the page or try again shortly.";
      return;
    }

    const filtered = getFilteredBikes();

    if (filtered.length === 0) {
      grid.innerHTML = "";
      paginationContainer.innerHTML = "";
      resultsCount.textContent = "Displaying 0 of 0";
      viewPage.textContent = "";
      statusRegion.textContent = "No bikes match the selected filters.";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageBikes = filtered.slice(start, start + PAGE_SIZE);

    statusRegion.textContent = "";
    grid.innerHTML = pageBikes.map(cardMarkup).join("");

    resultsCount.textContent = `Displaying ${pageBikes.length} of ${filtered.length}`;
    viewPage.textContent = `Page ${currentPage} of ${totalPages}`;
    renderPagination(totalPages);
  };

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      currentPage = 1;
      render();
    });

    form.addEventListener("reset", () => {
      setTimeout(() => {
        currentPage = 1;
        render();
      }, 0);
    });
  }

  statusRegion.textContent = "Loading bikes…";

  supabase
    .from("bikes")
    .select("slug,name,brand,category,price_paise,image_path")
    .eq("is_active", true)
    .order("name")
    .then(({ data, error }) => {
      if (error) {
        loadError = error;
        console.error("Failed to load bikes:", error);
      } else {
        allBikes = data;
      }
      render();
    });
});
