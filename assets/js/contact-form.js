document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("contactForm");

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const name = document.getElementById('fullName').value.trim();
        const email = document.getElementById('emailAddress').value.trim();
        const message = document.getElementById('userMessage').value.trim();
        const consent = form.querySelector('input[type="checkbox"]');

        const isValidEmail = (email) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!name || !email || !message) {
            alert("Please fill out all fields.");
            return;
        }

        if (!isValidEmail(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        if (!consent.checked) {
            alert("Please agree to the terms before proceeding.");
            return;
        }

        const phoneNumber = "910000000000";
        const encodedMsg = encodeURIComponent(
            `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
        );

        const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodedMsg}`;
        window.open(whatsappURL, "_blank");
    });
});
