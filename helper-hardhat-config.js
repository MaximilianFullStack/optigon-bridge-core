const networkConfig = {
    420: {
        name: "ogoerli",
    },
    80001: {
        name: "mumbai",
        wethAddress: "0x2bdd17D5Ad8E2715935E480987E7527047213E1A",
    },
    1337: {
        name: "hardhat",
    },
}

const developmentChains = ["hardhat", "localhost"]

module.exports = {
    networkConfig,
    developmentChains,
}
