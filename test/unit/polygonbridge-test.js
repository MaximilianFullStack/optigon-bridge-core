const { deployments, ethers, getNamedAccounts, waffle } = require("hardhat")
const { expect, assert } = require("chai")

const oneEth = ethers.utils.parseEther("1")
const oEthFee = oneEth.div(334)
const oEthBamt = oneEth.sub(oEthFee)

describe("PolygonBridgeV1", async function () {
    let bridge, deployer, WETH
    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["polygon"])
        bridge = await ethers.getContract("PolygonBridgeV1", deployer)
        WETH = await ethers.getContract("WETH9", deployer)
        await WETH.deposit({ value: oneEth })
    })

    describe("recieve", async function () {
        it("sends matic to owner", async function () {
            const accounts = await ethers.getSigners()
            const bal1 = await accounts[0].getBalance()
            await accounts[1].sendTransaction({
                to: bridge.address,
                value: oneEth,
            })
            const bal2 = await accounts[0].getBalance()
            assert.equal(bal1.add(oneEth).toString(), bal2.toString())
        })
    })
    describe("bridgeWeth", async function () {
        it("fails if zero weth is sent", async function () {
            expect(bridge.bridgeWeth()).to.be.revertedWith("Zero value input")
        })
        it("intakes funds and updates variables", async function () {
            await WETH.approve(bridge.address, oneEth)
            await bridge.bridgeWeth(oneEth)
            const contractBal = await WETH.balanceOf(bridge.address)
            const genFees = await bridge.totalGeneratedFees()
            const tlv = await bridge.TLV()
            assert.equal(contractBal.toString(), oneEth.toString())
            assert.equal(genFees.toString(), oEthFee.toString())
            assert.equal(tlv.toString(), oEthBamt.toString())
        })
        it("emits the correct data", async function () {
            await WETH.approve(bridge.address, oneEth)
            const tx = await bridge.bridgeWeth(oneEth)
            const transactionReceipt = await tx.wait()
            assert.equal(deployer, transactionReceipt.events[1].args[0])
            assert.equal(
                oEthBamt.toString(),
                transactionReceipt.events[1].args[1].toString()
            )
            assert.equal(
                oEthFee.toString(),
                transactionReceipt.events[1].args[2].toString()
            )
            assert.equal(
                transactionReceipt.blockNumber,
                transactionReceipt.events[1].args[3]
            )
        })
    })
    describe("sendBridgedFunds", async function () {
        it("fails if the fee is higher than bridged amount", async function () {
            expect(
                bridge.sendBridgedFunds(deployer, oEthFee, oEthBamt)
            ).to.be.revertedWith("Invalid tx input")
        })
        it("calls refund if there is not enough liquidity for tx", async function () {
            const tx = await bridge.sendBridgedFunds(
                deployer,
                oEthBamt,
                oEthFee
            )
            const transactionReceipt = await tx.wait()
            assert.equal(
                "Not enough liquidity",
                transactionReceipt.events[0].args[3]
            )
        })
        it("emits correct data on revert event", async function () {
            const tx = await bridge.sendBridgedFunds(
                deployer,
                oEthBamt,
                oEthFee
            )
            const transactionReceipt = await tx.wait()
            assert.equal(deployer, transactionReceipt.events[0].args[0])
            assert.equal(
                oEthBamt.toString(),
                transactionReceipt.events[0].args[1].toString()
            )
            assert.equal(
                oEthFee.toString(),
                transactionReceipt.events[0].args[2].toString()
            )
            assert.equal(
                "Not enough liquidity",
                transactionReceipt.events[0].args[3]
            )
            assert.equal(
                transactionReceipt.blockNumber,
                transactionReceipt.events[0].args[4]
            )
        })
        it("pays user and updates status variables", async function () {
            await WETH.deposit({ value: oneEth })
            await WETH.approve(bridge.address, oneEth)
            await bridge.stake(oneEth)
            await WETH.approve(bridge.address, oneEth)
            await bridge.bridgeWeth(oneEth)
            const tlv1 = await bridge.TLV()
            const fee1 = await bridge.totalGeneratedFees()
            const uBal1 = await WETH.balanceOf(deployer)
            await bridge.sendBridgedFunds(deployer, oEthBamt, oEthFee)
            const tlv2 = await bridge.TLV()
            const fee2 = await bridge.totalGeneratedFees()
            const uBa2 = await WETH.balanceOf(deployer)
            assert.equal(tlv1.toString(), oneEth.add(oEthBamt).toString())
            assert.equal(fee1.toString(), oEthFee.toString())
            assert.equal(uBal1, uBa2.sub(oEthBamt).toString())
            assert.equal(tlv2.toString(), oneEth.toString())
            assert.equal(fee2.toString(), oEthFee.toString())
        })
    })
    describe("refund", async function () {
        it("fails when fee is larger than amount", async function () {
            expect(
                bridge.refund(deployer, oEthFee, oEthBamt)
            ).to.be.revertedWith("Invalid tx input")
        })
        it("refunds the user and updates status variables", async function () {
            await WETH.approve(bridge.address, oneEth)
            await bridge.bridgeWeth(oneEth)
            const uBal1 = await WETH.balanceOf(deployer)
            const tlv1 = await bridge.TLV()
            const fee1 = await bridge.totalGeneratedFees()
            await bridge.refund(deployer, oEthBamt, oEthFee)
            const tlv2 = await bridge.TLV()
            const fee2 = await bridge.totalGeneratedFees()
            const uBal2 = await WETH.balanceOf(deployer)
            assert.equal(uBal2.toString(), uBal1.add(oneEth).toString())
            assert.equal(tlv2.toString(), tlv1.sub(oEthBamt).toString())
            assert.equal(fee1.toString(), fee2.add(oEthFee).toString())
        })
    })
    describe("stake", async function () {
        it("fails with zero value", async function () {
            expect(bridge.stake()).to.be.revertedWith("Zero value input")
        })
        it("fails if user already has a staked position", async function () {
            await WETH.approve(bridge.address, oneEth)
            await bridge.stake(oneEth)
            await WETH.deposit({ value: oneEth })
            await WETH.approve(bridge.address, oneEth)
            expect(bridge.stake(oneEth)).to.be.revertedWith(
                "User already has a position"
            )
        })
        it("adds to the liquidy pool and updates status arrays and mapping", async function () {
            await WETH.approve(bridge.address, oneEth)
            await bridge.stake(oneEth)
            const liquidProviders = await bridge.totalLiquidityProviders()
            const tlv = await bridge.TLV()
            const position = await bridge.stakedPosition(deployer)
            const shareOfPool = await bridge.poolShare(deployer)
            assert.equal(liquidProviders, 1)
            assert.equal(tlv.toString(), oneEth.toString())
            assert.equal(position.toString(), oneEth.toString())
            assert.equal(shareOfPool.toString(), oneEth)
        })
    })
    describe("unStake", async function () {
        it("fails if user does not have a position", async function () {
            expect(bridge.unStake()).to.be.revertedWith(
                "User has no ether staked"
            )
        })
        it("trasfers the funds to the staker and updates arrays and mappings", async function () {
            const bal1 = await WETH.balanceOf(deployer)
            await WETH.approve(bridge.address, oneEth)
            await bridge.stake(oneEth)
            await bridge.unStake()
            const bal2 = await WETH.balanceOf(deployer)
            const tlv = await bridge.TLV()
            const position = await bridge.stakedPosition(deployer)
            const shareOfPool = await bridge.poolShare(deployer)
            assert.equal(bal1.toString(), bal2.toString())
            assert.equal(tlv.toString(), 0)
            assert.equal(position.toString(), 0)
            assert.equal(shareOfPool.toString(), 0)
        })
    })
    describe("distribute funds", async function () {
        it("fails if there are no generated fees", async function () {
            expect(bridge.distributeFees()).to.be.revertedWith(
                "No fees generated"
            )
        })
        it("distributes all fees to the owner if there are no liquidity providers", async function () {
            await WETH.approve(bridge.address, oneEth)
            await bridge.bridgeWeth(oneEth)
            const bal1 = await WETH.balanceOf(deployer)
            await bridge.distributeFees()
            const bal2 = await WETH.balanceOf(deployer)
            assert.equal(bal2.toString(), bal1.add(oEthFee).toString())
        })
        it("distrubutes fees to all parties according to pool share (stress test)", async function () {
            const accounts = await ethers.getSigners()

            // staking with various amounts
            WETH = await WETH.connect(accounts[11])
            await WETH.deposit({ value: oneEth.mul(1500) })
            bridge = await bridge.connect(accounts[11])
            await WETH.approve(bridge.address, oneEth.mul(1500))
            await bridge.stake(oneEth.mul(1500))

            WETH = await WETH.connect(accounts[12])
            await WETH.deposit({ value: oneEth.mul(450) })
            bridge = await bridge.connect(accounts[12])
            await WETH.approve(bridge.address, oneEth.mul(450))
            await bridge.stake(oneEth.mul(450))

            WETH = await WETH.connect(accounts[13])
            await WETH.deposit({ value: oneEth.mul(3) })
            bridge = await bridge.connect(accounts[13])
            await WETH.approve(bridge.address, oneEth.mul(3))
            await bridge.stake(oneEth.mul(3))

            WETH = await WETH.connect(accounts[14])
            await WETH.deposit({ value: oneEth.mul(78) })
            bridge = await bridge.connect(accounts[14])
            await WETH.approve(bridge.address, oneEth.mul(78))
            await bridge.stake(oneEth.mul(78))

            WETH = await WETH.connect(accounts[15])
            await WETH.deposit({ value: oneEth.mul(16) })
            bridge = await bridge.connect(accounts[15])
            await WETH.approve(bridge.address, oneEth.mul(16))
            await bridge.stake(oneEth.mul(16))

            // init bridge
            WETH = await WETH.connect(accounts[1])
            await WETH.deposit({ value: oneEth.mul(2697) })
            bridge = await bridge.connect(accounts[1])
            await WETH.approve(bridge.address, oneEth.mul(2697))
            await bridge.bridgeWeth(oneEth.mul(2697))

            WETH = await WETH.connect(accounts[2])
            await WETH.deposit({ value: oneEth.mul(420) })
            bridge = await bridge.connect(accounts[2])
            await WETH.approve(bridge.address, oneEth.mul(420))
            await bridge.bridgeWeth(oneEth.mul(420))

            WETH = await WETH.connect(accounts[3])
            await WETH.deposit({ value: oneEth.mul(5) })
            bridge = await bridge.connect(accounts[3])
            await WETH.approve(bridge.address, oneEth.mul(5))
            await bridge.bridgeWeth(oneEth.mul(5))

            WETH = await WETH.connect(accounts[4])
            await WETH.deposit({ value: oneEth.mul(27) })
            bridge = await bridge.connect(accounts[4])
            await WETH.approve(bridge.address, oneEth.mul(27))
            await bridge.bridgeWeth(oneEth.mul(27))

            // **simulating paying back on other network**
            bridge = await bridge.connect(accounts[0])
            await bridge.sendBridgedFunds(
                accounts[1].address,
                oEthBamt.mul(2697),
                oEthFee.mul(2697)
            )
            await bridge.sendBridgedFunds(
                accounts[2].address,
                oEthBamt.mul(420),
                oEthFee.mul(420)
            )
            await bridge.sendBridgedFunds(
                accounts[3].address,
                oEthBamt.mul(5),
                oEthFee.mul(5)
            )
            await bridge.sendBridgedFunds(
                accounts[4].address,
                oEthBamt.mul(27),
                oEthFee.mul(27)
            )

            // unstake
            bridge = await bridge.connect(accounts[14])
            await bridge.unStake()

            let genFees = await bridge.totalGeneratedFees()
            genFees = genFees.div(2)
            const pool = await bridge.TLV()
            const depBal = await WETH.balanceOf(accounts[0].address)
            const liq1Bal = await WETH.balanceOf(accounts[11].address)
            const liq2Bal = await WETH.balanceOf(accounts[12].address)
            const liq3Bal = await WETH.balanceOf(accounts[13].address)
            const liq4Bal = await WETH.balanceOf(accounts[15].address)
            const unStakerBal = await WETH.balanceOf(accounts[14].address)

            //distribute fees!
            bridge = await bridge.connect(accounts[16])
            await bridge.distributeFees()

            const depBal2 = await WETH.balanceOf(accounts[0].address)
            const liq1Bal2 = await WETH.balanceOf(accounts[11].address) // 1500 weth staked
            const liq1Share = (
                await bridge.poolShare(accounts[11].address)
            ).mul(genFees)
            const liq2Bal2 = await WETH.balanceOf(accounts[12].address) // 450 weth staked
            const liq2Share = (
                await bridge.poolShare(accounts[12].address)
            ).mul(genFees)
            const liq3Bal2 = await WETH.balanceOf(accounts[13].address) // 3 weth staked
            const liq3Share = (
                await bridge.poolShare(accounts[13].address)
            ).mul(genFees)
            const liq4Bal2 = await WETH.balanceOf(accounts[15].address) // 16 weth staked
            const liq4Share = (
                await bridge.poolShare(accounts[15].address)
            ).mul(genFees)
            const unStakerBal2 = await WETH.balanceOf(accounts[14].address)

            assert.equal(depBal2.sub(depBal).toString(), genFees.toString())
            assert.equal(
                liq1Bal2.sub(liq1Bal).toString(),
                liq1Share.div(oneEth).toString()
            )
            assert.equal(
                liq2Bal2.sub(liq2Bal).toString(),
                liq2Share.div(oneEth).toString()
            )
            assert.equal(
                liq3Bal2.sub(liq3Bal).toString(),
                liq3Share.div(oneEth).toString()
            )
            assert.equal(
                liq4Bal2.sub(liq4Bal).toString(),
                liq4Share.div(oneEth).toString()
            )
            assert.equal(unStakerBal2.sub(unStakerBal).toString(), 0)
        })
    })
})
