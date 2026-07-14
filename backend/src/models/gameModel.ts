import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Game — owner of one knowledge base. Its _id is the Qdrant namespace key
// (collections kb_{gameId}_{type}). Projects and Questlines reference a Game
// via an optional gameId, so many projects can share one KB.
// ---------------------------------------------------------------------------

export interface IGame extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Game:
 *       type: object
 *       required:
 *         - name
 *         - ownerId
 *       properties:
 *         _id:
 *           type: string
 *         ownerId:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const GameSchema = new Schema<IGame>(
  {
    ownerId:     { type: String, required: true, index: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

const GameModel = mongoose.model<IGame>('Game', GameSchema);

export default GameModel;
