"use-strict"

// Get the Kinvey Flex SDK.
const kinveyFlexSDK = require("kinvey-flex-sdk");

// GraphQL related dependencies.
const {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLNonNull,
} = require("graphql");

// The Kinvey Collection, that you will be dealing with.
const COLLECTION_NAME = "FriendsAges";

/**
 * Since the Kinvey Flex SDK uses a callback pattern, we'll need to
 * wrap those in promises.
 * 
 * @param { Function } func 
 */
function promisify(func) {
    return (...args) => {
        return new Promise((resolve, reject) => {
            func(...args, (error, data) => {
                if (error) {
                    return reject(error);
                }
                return resolve(data);
            });
        });
    };
}

/**
 * Fetch our Friend's data from the Kinvey Collection.
 * 
 * @param { String } name 
 * @param { Object } context 
 */
function fetchFriendData(name, context) {
    const findPromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).find);
    return findPromisified(new context.modules.Query().equalTo("name", name))
        .then(data => data[0]);
}

/**
 * Logs any errors occured while processing the request.
 * 
 * @param { Error } error 
 * @param { Object } context
 */
function logPromiseError(error, context) {
    // Flex Logger is a custom module for logging.
    // Please check the link given below.
    // https://devcenter.kinvey.com/nodejs/guides/flex-services#LoggingMessages
    context.flex.logger.error(error);
    return Promise.reject(error);
}

/**
 * Reveals to us what the age of a friend of ours is.
 * 
 * @param { String } name 
 * @param { Object } context
 */
function getAge(name, context) {
    return fetchFriendData(name, context)
        .then((data) => {
            if (!data || !data.age) {
                return `Sorry. You still have not set age for your friend - ${name}. You can do that now.`;
            }
            return `Your friend - ${name}'s age is ${data.age}.`;
        })
        .catch(error => logPromiseError(error, context));
};

/**
 * Sets the age of a friend of ours.
 * 
 * @param { String } name 
 * @param { Number } age 
 * @param { Object } context 
 */
function setAge(name, age, context) {
    return fetchFriendData(name, context)
        .then((data) => {
            const savePromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).save);
            if (!data) {
                return savePromisified({ name, age });
            }
            data.age = age;
            return savePromisified(data);
        })
        .then(data => data.age)
        .catch(error => logPromiseError(error, context));
};

// The query & mutation declarations to the schema.
const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: "RootQueryType",
        fields: {
            getAge: {
                args: { name: { name: "name", type: new GraphQLNonNull(GraphQLString) } },
                type: GraphQLString,
                resolve(parent, args, context) {
                    return getAge(args.name, context);
                }
            }
        }
    }),
    mutation: new GraphQLObjectType({
        name: "RootMutationType",
        fields: {
            setAge: {
                args: {
                    name: { name: "name", type: new GraphQLNonNull(GraphQLString) },
                    age: { name: "age", type: new GraphQLNonNull(GraphQLInt) }
                },
                type: GraphQLString,
                resolve(parent, args, context) {
                    return setAge(args.name, args.age, context);
                }
            }
        }
    })
});

// Initialize the Kinvey Flex Service.
kinveyFlexSDK.service((err, flex) => {
    if (err) {
        console.error("Error while initializing Flex!");
        console.error(err);
        return;
    }
    // Register the Kinvey Flex Function.
    flex.functions.register("query", (context, complete, modules) => {
        /**
         * Since Flex functions get executed within different contexts (app environments),
         * the information carried within the "context" and "modules" might 
         * differ. So, for each GraphQL request the respective function call's context needs
         * to be prepared.
         */
        const graphqlArguments = {
            schema,
            source: context.query.query,
            contextValue: { flex, context, modules }
        };
        // FIRE!
        graphql(graphqlArguments)
            .then(data => complete().setBody(data).ok().next())
            .catch(error => complete().setBody(error).runtimeError().done());
    });
});
