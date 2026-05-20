import { buildDirectTX, DIRECTED_STAKE_PROGRAM_ID, makeDirectedStakeProgram, findDirectorAddress, directorParser } from '@thevault/directed-stake';
import { type Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import NodeWalletRaw from '@coral-xyz/anchor/dist/cjs/nodewallet.js';
// @ts-ignore
const NodeWallet = NodeWalletRaw.default ?? NodeWalletRaw;

export async function getDirectInstruction(owner: string, target: string, connection: Connection) {
    const directorAddress = findDirectorAddress(new PublicKey(owner));
    const directorAddressInfo = await connection.getAccountInfo(directorAddress);
    const isUpdatingExisting = directorAddressInfo?.owner.equals(DIRECTED_STAKE_PROGRAM_ID);

    // If binding already points to the same target, no instruction needed —
    // skipping it keeps the transaction free of the directed-stake program,
    // which Phantom cannot decode and flags as suspicious.
    if (isUpdatingExisting && directorAddressInfo?.data) {
        try {
            const decoded = directorParser.parse(directorAddressInfo.data);
            if (decoded.stakeTarget.equals(new PublicKey(target))) {
                return [];
            }
        } catch {
            // parse failure — fall through to update
        }
    }

    const wallet = new NodeWallet(Keypair.generate());
    const provider = new AnchorProvider(connection, wallet);
    const program = makeDirectedStakeProgram(provider);
    return await buildDirectTX(
        program,
        new PublicKey(owner),
        new PublicKey(target),
        isUpdatingExisting
    );
}
