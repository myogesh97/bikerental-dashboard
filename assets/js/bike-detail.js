document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");
    const bike = BIKES.find((b) => b.slug === slug) || BIKES[0];

    document.title = `Rent the ${bike.name} - Bike Rental`;

    const galleryImg = document.getElementById("bikeGalleryImage");
    if (galleryImg) {
        galleryImg.src = bike.image;
        galleryImg.alt = bike.name;
    }

    const availabilityLabel = bike.availability === "available" ? "Available" : "Not Available";
    const info = document.getElementById("productInfo");
    info.innerHTML = `
        <h1>${bike.name}</h1>
        <div class="info-item">
            <span class="info-label">Status:</span>
            <span class="info-value">${availabilityLabel}</span>
        </div>
        <div class="price">&#8377;${bike.price}<span class="per-day">/day</span></div>
        <div class="bike-specs">
            <h2>Bike Specifications</h2>
            <div class="spec-grid">
                <div class="spec-item"><h3>Fuel</h3><p>${bike.specs.fuel}</p></div>
                <div class="spec-item"><h3>Engine</h3><p>${bike.specs.engine}</p></div>
                <div class="spec-item"><h3>Gears</h3><p>${bike.specs.gears}</p></div>
                <div class="spec-item"><h3>Mileage</h3><p>${bike.specs.mileage}</p></div>
                <div class="spec-item"><h3>Brand</h3><p>${bike.brandLabel}</p></div>
                <div class="spec-item"><h3>Rental Basis</h3><p>Per Day</p></div>
            </div>
            <p class="deposit-note">Security deposit and exact terms are confirmed with our team before handover &mdash; <a href="contact.html">contact us</a> for details.</p>
        </div>
        <div class="product-purchase-actions">
            <button id="whatsappButton" class="btn btn-primary" aria-label="Contact us via WhatsApp about this bike"${bike.availability === "available" ? "" : " disabled"}>
                <ion-icon name="logo-whatsapp" aria-hidden="true"></ion-icon> Contact us
            </button>
            ${bike.availability === "available" ? "" : '<p class="unavailable-note">This bike is currently not available for rent. Contact us to ask about similar bikes or waitlist options.</p>'}
        </div>
    `;

    const whatsappButton = document.getElementById("whatsappButton");
    if (whatsappButton) {
        const message = `Hi, I'm interested in renting the bike: ${bike.name} priced at ₹${bike.price}/day. Please provide more details.`;
        const whatsappURL = `https://wa.me/919876543210?text=${encodeURIComponent(message)}`;
        whatsappButton.addEventListener("click", () => {
            window.open(whatsappURL, "_blank");
        });
    }

    const related = BIKES.filter((b) => b.slug !== bike.slug).slice(0, 3);
    const relatedContainer = document.getElementById("relatedBikes");
    if (relatedContainer) {
        relatedContainer.innerHTML = related.map((b) => `
            <div class="col-lg-4 col-md-4">
                <div class="product-card">
                    <a href="bike.html?slug=${b.slug}">
                        <img src="${b.image}" alt="${b.name}">
                        <div class="card-content">
                            <h3>${b.name}</h3>
                            <p class="price">&#8377;${b.price}<span class="per-day">/day</span></p>
                        </div>
                    </a>
                </div>
            </div>
        `).join("");
    }
});
