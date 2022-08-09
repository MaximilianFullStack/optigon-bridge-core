const { ethers, getNamedAccounts } = require("hardhat")
require("dotenv").config()

const polyAddress = "0x4DaF6286C410cBDB30B597b3256E337625422870"
const optiAddress = "0xdc86E2397E89cc5E68aDe54B258dc097FEbB0bf8"

const optiRPC = process.env.OGOERLI_URL

const polyRelay = async () => {
    const alchemy = new ethers.providers.JsonRpcProvider(optiRPC)
    const optiBridge = new ethers.getContractAt(
        optiAddress,
        "OptimismBridgeV1",
        alchemy
    )

    optiBridge.on("bridgeInitiated", (userAddress, bridgedAmount, fee) => {
        console.log("Optimism to Polygon bridge intitated")
        completeBridge(userAddress, bridgedAmount, fee)
    })

    optiBridge.on("bridgeReverted", (user, bridgedAmount, fee) => {
        console.log("Poly to Opti bridge tx reverted")
        revertBridge(user, bridgedAmount, fee)
    })
}

const completeBridge = async (user, bridgedAmount, fee) => {
    deployer = (await getNamedAccounts()).deployer
    polyBridge = await ethers.getContractAt(
        polyAddress,
        "PolygonBridgeV1",
        deployer
    )

    try {
        await polyBridge.sendBridgedFunds(user, bridgedAmount, fee)
        console.log(
            `Optimism => Polygon bridge for ${ethers.utils.formatEther(
                bridgedAmount.toString()
            )} WETH.`
        )
    } catch (e) {
        console.log(e)
    }
}

const revertBridge = async (user, bridgedAmount, fee) => {
    deployer = (await getNamedAccounts()).deployer
    polyBridge = await ethers.getContractAt(
        polyAddress,
        "PolygonBridgeV1",
        deployer
    )

    try {
        await polyBridge.refund(user, bridgedAmount, fee)
        console.log(
            `Refunded ${ethers.utils
                .formatEther(bridgedAmount.add(fee))
                .toString()} on Polygon.`
        )
    } catch (e) {
        console.log(e)
    }
}

polyRelay()
