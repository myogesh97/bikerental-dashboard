// Bike detail page: fetches the single bike by slug from Supabase
// (replacing the old static assets/js/bikes-data.js lookup).
//
// Deliberately NOT included: the old "Status: Available/Not Available"
// line and the disabled-WhatsApp-button-when-unavailable logic. That
// was driven by a static, fake availability field - this project's
// hard rule is "no mocked availability". Real per-date availability
// needs get_availability() (Phase 3); until then, the WhatsApp button
// always works, which is honest (it always did just open a chat, it
// never actually checked real availability either).
import { supabase } from "./supabase-client.js";

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const info = document.getElementById("productInfo");
  const galleryImg = document.getElementById("bikeGalleryImage");
  const relatedContainer = document.getElementById("relatedBikes");

  if (!slug) {
    info.innerHTML = `<h1 class="sr-only">Bike not found</h1><p role="status" class="unavailable-note">No bike was specified. <a href="bike-shop.html">Browse our fleet</a>.</p>`;
    return;
  }

  const { data: bike, error } = await supabase
    .from("bikes")
    .select("slug,name,brand_label,category,price_paise,image_path,specs")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load bike:", error);
    info.innerHTML = `<h1 class="sr-only">Unable to load bike details</h1><p role="status" class="unavailable-note">We couldn't load this bike's details right now. Please refresh the page or try again shortly.</p>`;
    return;
  }

  if (!bike) {
    info.innerHTML = `<h1 class="sr-only">Bike not found</h1><p role="status" class="unavailable-note">We couldn't find that bike. <a href="bike-shop.html">Browse our fleet</a>.</p>`;
    return;
  }

  document.title = `Rent the ${bike.name} - Bike Rental`;

  if (galleryImg) {
    galleryImg.src = bike.image_path;
    galleryImg.alt = bike.name;
  }

  const priceRupees = (bike.price_paise / 100).toFixed(0);

  info.innerHTML = `
        <h1>${bike.name}</h1>
        <div class="price">&#8377;${priceRupees}<span class="per-day">/day</span></div>
        <div class="bike-specs">
            <h2>Bike Specifications</h2>
            <div class="spec-grid">
                <div class="spec-item"><h3>Fuel</h3><p>${bike.specs.fuel}</p></div>
                <div class="spec-item"><h3>Engine</h3><p>${bike.specs.engine}</p></div>
                <div class="spec-item"><h3>Gears</h3><p>${bike.specs.gears}</p></div>
                <div class="spec-item"><h3>Mileage</h3><p>${bike.specs.mileage}</p></div>
                <div class="spec-item"><h3>Brand</h3><p>${bike.brand_label}</p></div>
                <div class="spec-item"><h3>Rental Basis</h3><p>Per Day</p></div>
            </div>
            <p class="deposit-note">Security deposit and exact terms are confirmed with our team before handover &mdash; <a href="contact.html">contact us</a> for details.</p>
        </div>
        <div class="product-purchase-actions">
            <button id="whatsappButton" class="btn btn-primary" aria-label="Contact us via WhatsApp about this bike">
                <ion-icon name="logo-whatsapp" aria-hidden="true"></ion-icon> Contact us
            </button>
        </div>
    `;

  const whatsappButton = document.getElementById("whatsappButton");
  if (whatsappButton) {
    const message = `Hi, I'm interested in renting the bike: ${bike.name} priced at ₹${priceRupees}/day. Please provide more details.`;
    const whatsappURL = `https://wa.me/910000000000?text=${encodeURIComponent(message)}`;
    whatsappButton.addEventListener("click", () => {
      window.open(whatsappURL, "_blank");
    });
  }

  if (relatedContainer) {
    const { data: related, error: relatedError } = await supabase
      .from("bikes")
      .select("slug,name,price_paise,image_path")
      .eq("is_active", true)
      .neq("slug", bike.slug)
      .order("name")
      .limit(3);

    if (relatedError) {
      console.error("Failed to load related bikes:", relatedError);
    } else {
      relatedContainer.innerHTML = related
        .map(
          (b) => `
            <div class="col-lg-4 col-md-4">
                <div class="product-card">
                    <a href="bike.html?slug=${b.slug}">
                        <img src="${b.image_path}" alt="${b.name}">
                        <div class="card-content">
                            <h3>${b.name}</h3>
                            <p class="price">&#8377;${(b.price_paise / 100).toFixed(0)}<span class="per-day">/day</span></p>
                        </div>
                    </a>
                </div>
            </div>
        `
        )
        .join("");
    }
  }
});
