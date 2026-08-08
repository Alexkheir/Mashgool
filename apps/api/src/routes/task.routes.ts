import { Router } from 'express';
import * as taskController from '../controllers/task.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import {
  CreateTaskDto,
  UpdateTaskDto,
  ChangeStatusDto,
  MoveTaskDto,
  ListTasksQueryDto,
  BoardQueryDto
} from '../dtos/task.dto';

// Tasks are addressed two ways. Operations that need a client context (list a
// workspace's tasks, create one in it) are nested under the client; operations on
// an existing task use its globally-unique id at the top level. Both routers
// require a session and re-scope every query to the owner in the service layer.

// Nested: mounted at `/clients/:clientId/tasks` — mergeParams exposes clientId.
export const clientTaskRouter = Router({ mergeParams: true });
clientTaskRouter.use(requireAuth);
clientTaskRouter.get('/', validateQuery(ListTasksQueryDto), taskController.listTasks);
clientTaskRouter.post('/', validate(CreateTaskDto), taskController.createTask);
// The same tasks grouped into board columns. Unpaginated and unsorted by query —
// the board has its own fixed shape — so it gets its own path rather than a mode
// flag on the list endpoint.
clientTaskRouter.get('/board', validateQuery(BoardQueryDto), taskController.getClientBoard);

// Flat: mounted at `/tasks` — operations on a task by id.
export const taskRouter = Router();
taskRouter.use(requireAuth);
// Declared before `/:taskId`, which would otherwise match "board" as an id.
taskRouter.get('/board', validateQuery(BoardQueryDto), taskController.getGlobalBoard);
taskRouter.get('/:taskId', taskController.getTask);
taskRouter.patch('/:taskId', validate(UpdateTaskDto), taskController.updateTask);
taskRouter.patch('/:taskId/status', validate(ChangeStatusDto), taskController.changeTaskStatus);
taskRouter.patch('/:taskId/order', validate(MoveTaskDto), taskController.moveTask);
taskRouter.delete('/:taskId', taskController.deleteTask);
