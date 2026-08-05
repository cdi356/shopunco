const tabs = document.querySelectorAll(".tab");

const pages = {
    shop: `
        <h1 class="page-header">Shop</h1>
        <p>
            W.I.P.
        </p>
    `,

    custom: `
        <h1 class="page-header">Custom</h1>
        <p>
            W.I.P.
        </p>
    `,

    about: `
        <h1 class="page-header">About</h1>
        <p>
            W.I.P.
        </p>
    `,

    contact: `
        <h1 class="page-header">Contact Us</h1>
        <p>
            W.I.P.
        </p>
    `
};

document.getElementById("content").innerHTML = pages.shop;

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => {
            t.classList.remove("active");
        });

        tab.classList.add("active");

        const page = tab.dataset.page;

        content.innerHTML = pages[page];
    });
});