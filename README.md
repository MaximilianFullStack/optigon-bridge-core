# Optigon Protocol

These contracts allow users to bridge Ether between Polygon and Optimism. They also serve as liquidity pools in which users can stake WETH/ETH depending on the network.  The contracts then distirbute the protocol's fees according to stakers share of the pool. Fifty percent of the fees go to the owner of the contracts and the other fifty percent is distrubuted amoung the stakers. Lastly, there is a mechanism to refund users if the bridge cannot be completed due to insufficent liquidity. 

## Relay

To relay information between the networks, the owner of the contracts has to run the relay scripts. Although this method is centralized, it is much simpilar than a "nodes" apporach which would require the contracts to varify the validity of the information they recieve.

Relay scripts:
  1. yarn hardhat run --network mumbai ./relay/polygonRelay.js
  2. yarn hardhat run --network ogoerli ./relay/optimismRelay.js
