# Optigon Protocol

The contracts allow users to bridge Ether between Polygon and Optimism. Also users can stake WETH/ETH depending on the network. Then the contract distirbutes the protocol's fees  according to stakers share of the pool. Finaly there is a mechanism to refund users if the bridge cannot be completed.

## Relay

To relay information between the networks, the owner of the contracts has to run the relay scripts. Although this method is centralized, it is much simpilar than a "nodes" apporach which would require the contracts to varify the validity of the information they recieve.

Relay scripts:
  1. yarn hardhat run --network mumbai ./relay/polygonRelay.js
  2. yarn hardhat run --network ogoerli ./relay/optimismRelay.js
