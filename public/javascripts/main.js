var app = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!',
        sites: [],
    },
    mounted() {
        this.getSites();
    },
    methods: {
        getSites() {
            axios.get('/getSites')
                .then((response) => {
                    console.log(response);
                    this.sites = response.data;
                })
                .catch((error) => {
                    console.log(error);
                });
        },
        prentSites() {
            console.log(this.sites);
        }
    }
});
