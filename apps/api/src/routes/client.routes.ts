import { Router } from 'express';
import * as clientController from '../controllers/client.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { CreateClientDto, UpdateClientDto } from '../dtos/client.dto';

export const clientRouter = Router();

// Every client route is behind a valid session — apply it once for the whole
// router rather than per-line. Data ownership is still enforced again in the
// service layer (queries scoped to req.user), never on this middleware alone.
clientRouter.use(requireAuth);

// NOTE: `/archived` is declared before `/:clientId` on purpose. Express matches
// routes top-to-bottom, first match wins — if the param route came first,
// GET /clients/archived would be captured as clientId="archived".
clientRouter.get('/', clientController.listClients);
clientRouter.get('/archived', clientController.listArchivedClients);
clientRouter.post('/', validate(CreateClientDto), clientController.createClient);

clientRouter.get('/:clientId', clientController.getClient);
clientRouter.patch('/:clientId', validate(UpdateClientDto), clientController.updateClient);
clientRouter.delete('/:clientId', clientController.deleteClient);
clientRouter.post('/:clientId/archive', clientController.archiveClient);
clientRouter.post('/:clientId/unarchive', clientController.unarchiveClient);
