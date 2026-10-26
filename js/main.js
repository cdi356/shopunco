const tabs = document.querySelectorAll(".tab");
const content = document.getElementById("content");
const pages = {
    top: `
        <h1 class="page-header">Top Selling</h1>
        <div class= "product-grid" id="product-grid"></div>
    `,

    editors: `
        <h1 class="page-header">Editor's Picks</h1>
        <p>
            W.I.P.
        </p>
    `,

    underrated: `
        <h1 class="page-header">Underrated Items</h1>
        <p>
            W.I.P.
        </p>
    `,

    wip: `
        <h1 class="page-header">W.I.P.</h1>
        <p>
            W.I.P.
        </p>
    `,
    account: `
        <h1 class="page-header">Account</h1>
        <p>
            W.I.P.
        </p>
    `,

    contact: `
        <h1 class="page-header">Contact Us</h1>
        <div class="contact">
            <input
                id="contact-name"
                type="contact-name"
                placeholder="name"
            >
            <input
                id="contact-email"
                type="contact-email"
                placeholder="email"
            >
            <input
                id="contact-text"
                type="contact-text"
                placeholder="textbox"
            >
            <button class="contact-submit">submit</button>
        </div>
    `,

    cart: `
        <h1 class="page-header">Your Cart</h1>
        <p>
            W.I.P.
        </p>
    `,
}



document.getElementById("content").innerHTML = pages.top;
renderProducts();

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => {
            t.classList.remove("active");
        });

        tab.classList.add("active");

        const page = tab.dataset.page;

        content.innerHTML = pages[page];
        if (page === "top") {
            renderProducts();
        }
    });
});

document.addEventListener("click", (event) => {
    if (event.target.classList.contains("addtocart")) {
        const product = products.find(p => p.id == event.target.dataset.id);

        cart.push(product);

        console.log(cart);
    }
});

function renderProducts() {
    const grid = document.getElementById("product-grid");

    products.forEach(product => {
        grid.innerHTML += `
            <div class="product-card">
                <img src="${product.image}">
                <h3>${product.name}</h3>
                <p>$${product.price}</p>
                <button class="addtocart" data-id="${product.id}">Add to Cart</button>
            </div>
        `;
    });
}