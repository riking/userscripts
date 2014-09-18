(function () {
    function addJquery(callback) {
        // Add jQuery
        var jq = document.createElement('script');
        jq.src = "//ajax.googleapis.com/ajax/libs/jquery/1/jquery.min.js";
        jq.onload = function() {
            console.log("jquery script element loaded");
            $ = window.$ = window.jQuery;

            callback();
            //window.jQuery(document).ready(callback);
        };
        document.getElementsByTagName('head')[0].appendChild(jq);
    }

    // Multiline Function String - Nate Ferrero - Public Domain
    function heredoc(f) {
        return f.toString().match(/\/\*\s*([\s\S]*?)\s*\*\//m)[1];
    }

    // ############################################################

    var STYLE = heredoc(function () { /*
     .comment.unread > .comment-content {
     background-color: rgba(253, 185, 26, 0.3);
     }

     .wp-paginate.wp-paginate-comments a.next, .wp-paginate.wp-paginate-comments a.prev {
     padding: 20px;
     background: rgb(220, 240, 215);
     }

     .commentnav {
     padding: 20px 0;
     }

     #comment-clear-message {
     color: green;
     font-weight: bold;
     margin-left: 6px;
     }
     */
    });

    var CONTROLS_HTML = heredoc(function() {/*
     <div class="unread-comments-controls">
       <div class="unread-comments-status"></div>
       <button class="unread-comments-mark unread-comments-btn">Mark Read</button>
       <button class="unread-comments-clear unread-comments-btn">Remove Data</button>
       <a href class="unread-comments-set">Manually Set</a>
       <span class="unread-comments-response"></span>
     </div>
     */
    });

    /**
     * Regex to parse the WordPress URLs on the site into an articleNumber ID and comment page.
     *
     * Group 1 - document type
     * Group 2 - document number
     * Group 3 - comment page (can be blank, blank = last page)
     *
     * @type {RegExp}
     */
    var URL_MATCHER = /grrlpowercomic\.com\/([^\/]+)\/(\d+)(?:\/comment-page(\d+))?/;

    // ############################################################

    var _storage;

    /**
     * Get the localStorage object, with error-checking on first call.
     *
     * @returns {Storage}
     */
    function getLocalStorage() {
        if (_storage) return _storage;

        if (typeof Storage === "undefined") {
            alert("Browser does not have localStorage, so the unread comments script cannot work.\n" +
                "\n\n" +
                "** Remove the script to get rid of this message. **\n\n" +
                "(Or grant localStorage access if it is being denied.)");
            throw new Error("localstorage failure");
        }

        // define setObject/getObject
        Storage.prototype.setObject = function(key, value) {
            this.setItem(key, JSON.stringify(value));
        };

        Storage.prototype.getObject = function(key) {
            return JSON.parse(this.getItem(key));
        };

        var storage;
        try {
            storage = window.localStorage;
        } catch (e) {
        }

        if (!storage) {
            alert("Browser appears to be denying access to localStorage!\n" +
                "\n" +
                "The unread comments script requires localStorage to function.\n" +
                "Please have the browser grant localStorage access to the script.\n" +
                "\n" +
                "(Or remove the unread comments script.)");
            throw new Error("localstorage failure");
        }
        return _storage = storage;
    }

    function getPageNumber() {
        var matches = URL_MATCHER.exec(window.location);
        return {
            recognized: !!matches,
            articleType: matches && matches[1],
            articleNumber: matches && matches[2],
            page: (matches && matches[3]) || (Number($(".page.current").first().text()))
        };
    }

    function getDataKey() {
        return "unread-comments-" + getPageNumber().articleNumber;
    }

    function getPageData() {
        localStorage.getObject(getDataKey())
    }

    function buttonResultMessage(message, classes) {
        var $elem = $('.unread-comments-controls .unread-comments-status');
        $elem.css('class', 'unread-comments-status ' + classes);
        $elem.text(message);
    }

    /**
     * Takes a jQuery selector for a li.comment inside the ol.commentList, and
     * returns the unix time that the comment was posted at.
     *
     * @param $comment jQuery-wrapped li element
     * @returns {number} unix time of comment posting
     */
    function getCommentDate($comment) {
        //noinspection JSPotentiallyInvalidConstructorUsage
        return Date.parse(Date($comment.find(".comment-time").attr('title')));
    }

    /**
     * Get the jQuery group for all comment elements on the page.
     * Memoized.
     *
     * @returns {Array} all comments on the page
     */
    function getAllComments() {
        if (_$comments) return _$comments;

        var $commentList = $('#comment-wrapper ol.commentlist'),
            $comments = $commentList.find('.comment');

        return _$comments = $comments;
    }

    var _$comments;


    function doHighlight() {

    }

    // ############################################################

    function clickMarkRead() {
        console.log('markread click');
        buttonResultMessage("Hello");
    }

    function clickDeleteData() {
        console.log('delete click');
    }

    function clickPickDate(e) {
        e.preventDefault();


    }

    // ############################################################

    function addControls() {
        var controls = jQuery.parseHTML(CONTROLS_HTML);
        // note - this will be 2 elements
        $('#comment-wrapper .commentnav').after(controls);
        var $controls = $('#comment-wrapper .unread-comments-controls');

        $controls.find('.unread-comments-mark').click(clickMarkRead);
        $controls.find('.unread-comments-clear').click(clickDeleteData);
        $controls.find('.unread-comments-set').click(clickPickDate);
    }

    function onReady() {
        console.log('onready');

        // add styles
        var css = document.createElement('style');
        css.innerHTML = STYLE;
        document.getElementsByTagName('head')[0].appendChild(css);

        addJquery(function() {
            console.log('jqLoaded');
            addControls();
            doHighlight();
        });
    }

    //document.addEventListener('DOMContentLoaded', onReady);
    onReady();
})();