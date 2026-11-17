import express from "express"
import dotenv from "dotenv"
import { ChatGoogle } from "@langchain/google";
import { TavilySearch } from "@langchain/tavily";
import { createAgent,tool } from "langchain";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { MessagesAnnotation, Send, StateGraph } from "@langchain/langgraph";
import { AIMessage ,HumanMessage } from "@langchain/core/messages";



dotenv.config();

const app = express();

app.use(express.json())

const port = process.env.PORT || 5000

const aiModel = new ChatGoogle({
    systemInstruction: "You are a specialized assistant. You MUST use the available tools to answer any real-time, external, Never answer from memory if a tool is provided.",
    model : "gemini-3.5-flash"
});

//inbuild tool
const searchTool = new TavilySearch({
    maxResults: 5,
    topic: "general"
});


//custom tool

const addNummberTool = tool(({ a, b }) => {
    return `add two number ${a} + ${b} is 7`
}, {
    name: "addition_number",
    description: "it add two number",
    schema: z.object({
        a: z.number(),
        b: z.number()
    })
})



// langchain logic 
app.post("/chat_agent_langchain", async (req, res) => {
    const { prompt } = req.body
    try {
        const agent = createAgent({
            model: aiModel,
            tools: [searchTool,addNummberTool]
        });
        const result = await agent.invoke({
            messages: [{
                role: "user",
                content: prompt
            }]
        })
        const lastMessage = result.messages[result.messages.length - 1]
        console.log(result)
        console.log(lastMessage.text)
        return res.json(lastMessage.text)
    } catch (error) {
        console.log("message edher?", error)

        return res.json(error.message)
    }
})

// langgraph logic
const tools = [searchTool,addNummberTool]
const langgraphAiModel = new ChatGoogle("gemini-3.5-flash").bindTools(tools)
const toolnode = new ToolNode(tools)
const toolAgent = async(state)=>{
    const result1 = await langgraphAiModel.invoke(
        ...state.messages
    )
    return {
        messages:[result1]
    }
}

const shouldCountine = async (state)=>{
    if(state.messages.tool_calls.length>0){
        return "tool_node"
    }else{
        return "__end__"
    }
}

const graph = new StateGraph(MessagesAnnotation)
.addNode("agent",toolAgent)
.addNode("tool_node",toolnode)
.addEdge("__start__","agent")
.addConditionalEdges("agent",shouldCountine)
.compile()

app.post("/chat_agent_langgraph", async (req, res) => {
    const { prompt } = req.body
    console.log(prompt)
    try {
        const result = await graph.invoke(new HumanMessage(prompt))
        const lastMessage = result.messages[result.messages.length - 1]
        console.log(result)
        console.log(lastMessage.content)
        return res.json(lastMessage.content)
    } catch (error) {
        console.log("message edher?", error)

        return res.json(error.message)
    }
})

app.listen(port, () => {
    console.log("server started at port", port)
})