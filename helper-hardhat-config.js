const networkConfig = {
    420: {
        name: "ogoerli",
    },
    80001: {
        name: "mumbai",
        wethAddress: "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa",
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
