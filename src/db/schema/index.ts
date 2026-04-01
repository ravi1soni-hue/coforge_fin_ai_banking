import { GraphStateTable } from "./graph_state.js";
import { MessagesTable } from "./message.js";
import { VectorDocumentsTable } from "./vector_documents.js";

export interface Database {
    messages: MessagesTable;
    graphStates: GraphStateTable;
    vectorDocuments: VectorDocumentsTable;
  }
  